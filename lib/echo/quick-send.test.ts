import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/native/echo-bridge', () => ({ queueNativeNotificationRefresh: vi.fn() }))
vi.mock('./legacy-activity', () => ({ noteLegacyActivity: vi.fn(async () => undefined) }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  limitToLast: vi.fn(() => ({})),
  // No pages today, no messages, no items: every one-off read is empty.
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
}))
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/firestore')>()),
  createDiaryPage: vi.fn(async () => 'page-new'),
  addPageMessage: vi.fn(async () => 'msg-1'),
  addNote: vi.fn(async () => 'note-1'),
  addReminder: vi.fn(async () => 'rem-1'),
  addMeal: vi.fn(async () => 'meal-1'),
  bumpPageMix: vi.fn(async () => undefined),
  upsertMemories: vi.fn(async () => undefined),
  setConnectorSecret: vi.fn(async () => undefined),
  deleteNote: vi.fn(async () => undefined),
  deleteGoal: vi.fn(async () => undefined),
  deleteReminder: vi.fn(async () => undefined),
  deleteMeal: vi.fn(async () => undefined),
}))
vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  sendToEcho: vi.fn(),
}))

import type { User } from 'firebase/auth'
import { addPageMessage, createDiaryPage, deleteGoal, deleteMeal, deleteNote, deleteReminder, type UserProfile } from '@/lib/firestore'
import { sendToEcho } from './client'
import { quickSend, undoSaved } from './quick-send'

const user = { uid: 'u1', getIdToken: async () => 't' } as unknown as User
const profile = { uid: 'u1', preferredName: 'Sam', priorities: [], yearGoals: [], importantPeople: [], tone: 'Gentle coach', checkInTime: '20:30' } as unknown as UserProfile

describe('quickSend', () => {
  beforeEach(() => {
    vi.mocked(createDiaryPage).mockClear()
    vi.mocked(addPageMessage).mockClear()
    vi.mocked(sendToEcho).mockReset()
  })

  it("quickSend creates today's page when none exists and saves both messages there", async () => {
    vi.mocked(sendToEcho).mockResolvedValue({
      reply: 'Saved a note.',
      actions: [{ type: 'note', title: 'Buy milk', body: 'Buy milk', category: 'general', tags: [] }],
      memories: [],
      trace: [],
    } as never)
    const out = await quickSend({ user, profile, text: '  remember to buy milk  ' })
    expect(createDiaryPage).toHaveBeenCalledTimes(1)
    expect(out.pageId).toBe('page-new')
    expect(sendToEcho).toHaveBeenCalledWith(user, 'remember to buy milk', expect.objectContaining({ recentMessages: [] }), undefined, {})
    const calls = vi.mocked(addPageMessage).mock.calls
    expect(calls[0].slice(0, 4)).toEqual(['u1', 'page-new', 'user', 'remember to buy milk'])
    expect(calls[1].slice(0, 4)).toEqual(['u1', 'page-new', 'assistant', 'Saved a note.'])
    expect(out.reply).toBe('Saved a note.')
    expect(out.saved).toEqual([expect.objectContaining({ type: 'note', label: 'Buy milk', docId: 'note-1' })])
    expect(out.failed).toEqual([])
  })

  it('quickSend keeps nothing half-saved and rethrows when sendToEcho fails', async () => {
    vi.mocked(sendToEcho).mockRejectedValue(new Error('Echo is unavailable (429).'))
    await expect(quickSend({ user, profile, text: 'call mom at 7' })).rejects.toThrow('Echo is unavailable (429).')
    expect(createDiaryPage).not.toHaveBeenCalled()
    expect(addPageMessage).not.toHaveBeenCalled()

    // A router error (reply with error set) is a failure too: nothing is written.
    vi.mocked(sendToEcho).mockResolvedValue({ reply: 'x', actions: [{ type: 'note', title: 'N', body: '', category: 'general', tags: [] }], memories: [], trace: [], error: true } as never)
    await expect(quickSend({ user, profile, text: 'call mom at 7' })).rejects.toThrow()
    expect(createDiaryPage).not.toHaveBeenCalled()
    expect(addPageMessage).not.toHaveBeenCalled()
  })
})

describe('undoSaved', () => {
  beforeEach(() => {
    for (const f of [deleteNote, deleteGoal, deleteReminder, deleteMeal]) vi.mocked(f).mockClear()
  })

  it('undoSaved deletes a created doc and refuses updates, deletes and items without docId', async () => {
    expect(await undoSaved('u1', { type: 'note', label: 'Buy milk', docId: 'n9' })).toBe(true)
    expect(deleteNote).toHaveBeenCalledWith('u1', 'n9')
    expect(await undoSaved('u1', { type: 'reminder', label: 'Call mom', docId: 'r9' })).toBe(true)
    expect(deleteReminder).toHaveBeenCalledWith('u1', 'r9')
    expect(await undoSaved('u1', { type: 'goal', label: 'Run', docId: 'g9' })).toBe(true)
    expect(deleteGoal).toHaveBeenCalledWith('u1', 'g9')
    expect(await undoSaved('u1', { type: 'health', label: 'lunch: soup', kcal: 300, docId: 'm9' })).toBe(true)
    expect(deleteMeal).toHaveBeenCalledWith('u1', 'm9')

    // Updates and deletes are never undone by deleting; neither is anything without the created doc's id.
    expect(await undoSaved('u1', { type: 'note', label: 'Edited', op: 'update', ref: 'n1', docId: 'n1' })).toBe(false)
    expect(await undoSaved('u1', { type: 'note', label: 'Gone', op: 'delete', docId: 'n2' })).toBe(false)
    expect(await undoSaved('u1', { type: 'note', label: 'No id' })).toBe(false)
    expect(await undoSaved('u1', { type: 'health', label: '2026-11-24' })).toBe(false)
    expect(await undoSaved('u1', { type: 'memory', label: '2nd Brain memories', docId: 'x' })).toBe(false)
    expect(deleteNote).toHaveBeenCalledTimes(1)
  })
})
