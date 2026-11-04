import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/firestore')>()),
  upsertMemories: vi.fn(async () => undefined),
  addPageMessage: vi.fn(async () => 'm1'),
  bumpPageMix: vi.fn(async () => undefined),
  addNote: vi.fn(async () => 'n1'),
  addReminder: vi.fn(async () => 'r1'),
  addMeal: vi.fn(async () => 'meal1'),
  deleteNote: vi.fn(async () => undefined),
  updateNote: vi.fn(async () => undefined),
  upsertHealthLog: vi.fn(async () => undefined),
  notesCol: vi.fn(() => ({})),
}))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({}) })),
}))

import { bumpPageMix, cleanMix, upsertMemories } from '@/lib/firestore'
import { applyActions, applyEchoResponse } from './client'
import { addRef } from './context'

const memories = [{ label: 'Alex', type: 'person' as const, linkIds: [] }]

describe('memories record their diary page', () => {
  beforeEach(() => vi.mocked(upsertMemories).mockClear())

  it('applyEchoResponse passes the page id to upsertMemories', async () => {
    await applyEchoResponse('u', 'page-1', { reply: 'ok', actions: [], memories, trace: [] })
    expect(upsertMemories).toHaveBeenCalledWith('u', memories, 'page-1')
  })
  it('applyActions passes opts.pageId (calls)', async () => {
    await applyActions('u', { actions: [], memories }, { pageId: 'page-2', source: 'call' })
    expect(upsertMemories).toHaveBeenCalledWith('u', memories, 'page-2')
  })
  it('applyActions resolves opts.getPageId lazily, only when there are memories', async () => {
    const getPageId = vi.fn(async () => 'page-3')
    await applyActions('u', { actions: [], memories: [] }, { getPageId })
    expect(getPageId).not.toHaveBeenCalled()
    await applyActions('u', { actions: [], memories }, { getPageId })
    expect(upsertMemories).toHaveBeenCalledWith('u', memories, 'page-3')
  })
})

describe('page mix', () => {
  beforeEach(() => {
    vi.mocked(bumpPageMix).mockReset()
    vi.mocked(bumpPageMix).mockResolvedValue(undefined)
  })
  const note = { type: 'note' as const, title: 'N', body: 'b', category: 'general' as const, tags: [] }
  const reminder = { type: 'reminder' as const, title: 'R', dueAt: '2030-01-01T10:00:00+00:00' }
  const meal = { type: 'meal_log' as const, mealType: 'lunch' as const, description: 'soup', date: '2030-01-01', nutrition: { items: [], totalCalories: 100 } }

  it('bumps the exact delta, without deletes', async () => {
    const refs = { entries: {}, next: { reminder: 1, note: 1, goal: 1, meal: 1 } } as never
    const ref = addRef(refs, 'note', 'old', 'Old')
    const res = await applyActions('u', { actions: [note, reminder, meal, { type: 'note_delete', ref }] as never, memories: [] }, { pageId: 'p', refs })
    expect(res.failed).toEqual([])
    expect(bumpPageMix).toHaveBeenCalledWith('u', 'p', { note: 1, reminder: 1, health: 1 })
  })
  it('does not count updates, only newly created items', async () => {
    const refs = { entries: {}, next: { reminder: 1, note: 1, goal: 1, meal: 1 } } as never
    const ref = addRef(refs, 'note', 'old', 'Old')
    const update = { type: 'note_update' as const, ref, title: 'Renamed' }
    const health = { type: 'health_update' as const, date: '2030-01-01', mood: 4 }
    const res = await applyActions('u', { actions: [note, update, health] as never, memories: [] }, { pageId: 'p', refs })
    expect(res.failed).toEqual([])
    expect(res.saved.filter((s) => s.op === 'update')).toHaveLength(2)
    expect(bumpPageMix).toHaveBeenCalledWith('u', 'p', { note: 1 })
  })
  it('does not bump when only updates were saved', async () => {
    const refs = { entries: {}, next: { reminder: 1, note: 1, goal: 1, meal: 1 } } as never
    const ref = addRef(refs, 'note', 'old', 'Old')
    const res = await applyActions('u', { actions: [{ type: 'note_update', ref, title: 'Renamed' }] as never, memories: [] }, { pageId: 'p', refs })
    expect(res.saved).toHaveLength(1)
    expect(bumpPageMix).not.toHaveBeenCalled()
  })
  it('does not bump when nothing countable was saved', async () => {
    await applyActions('u', { actions: [], memories }, { pageId: 'p' })
    expect(bumpPageMix).not.toHaveBeenCalled()
  })
  it('resolves getPageId once for memories and mix', async () => {
    const getPageId = vi.fn(async () => 'p9')
    await applyActions('u', { actions: [note] as never, memories }, { getPageId })
    expect(getPageId).toHaveBeenCalledTimes(1)
    expect(upsertMemories).toHaveBeenLastCalledWith('u', memories, 'p9')
    expect(bumpPageMix).toHaveBeenCalledWith('u', 'p9', { note: 1 })
  })
  it('a failing bump does not fail the save', async () => {
    vi.mocked(bumpPageMix).mockRejectedValue(new Error('denied'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await applyActions('u', { actions: [note] as never, memories: [] }, { pageId: 'p' })
    spy.mockRestore()
    expect(res.failed).toEqual([])
    expect(res.saved).toHaveLength(1)
  })
})

describe('cleanMix', () => {
  it('keeps only positive integers', () => {
    expect(cleanMix({ note: 2, goal: 0, reminder: -1, health: 1.5 })).toEqual({ note: 2 })
    expect(cleanMix({})).toEqual({})
  })
})
