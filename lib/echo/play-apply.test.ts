import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/firestore')>()),
  addReminder: vi.fn(async () => 'rem-1'),
  addPageMessage: vi.fn(async () => 'msg-1'),
  upsertMemories: vi.fn(async () => undefined),
}))

import { addPageMessage, addReminder } from '@/lib/firestore'
import { applyEchoResponseWithMusic } from './client'
import { MUSIC_REPLIES } from './music-play'
import type { EchoResponse } from './types'

const ID = 'dQw4w9WgXcQ'
const both = (): EchoResponse => ({
  reply: "Done, I'll remind you at 8 — playing lofi now.",
  actions: [{ type: 'reminder', title: 'Call Mama', dueAt: '2026-10-25T20:00:00+08:00' }, { type: 'play_music', query: 'lofi' }],
  memories: [],
  trace: [],
})

describe('applyEchoResponseWithMusic (typed chat, combined response)', () => {
  beforeEach(() => {
    vi.mocked(addReminder).mockClear()
    vi.mocked(addPageMessage).mockClear()
  })
  it('applies the save AND opens the player', async () => {
    const open = vi.fn()
    const r = await applyEchoResponseWithMusic('u', 'p', both(), async () => ({ ok: true, track: { videoId: ID, title: 'Lofi Girl' } }), open)
    expect(addReminder).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith({ videoId: ID, title: 'Lofi Girl' })
    expect(r.saved.map((s) => s.type)).toEqual(['reminder'])
    expect(r.reply).toBe("Done, I'll remind you at 8 — playing lofi now.")
    expect(vi.mocked(addPageMessage).mock.calls[0][3]).toBe(r.reply)
  })
  it('when the search fails: still saves, opens nothing, and the reply never claims playing', async () => {
    const open = vi.fn()
    const r = await applyEchoResponseWithMusic('u', 'p', both(), async () => ({ ok: false, error: 'not_found', reply: MUSIC_REPLIES.not_found }), open)
    expect(addReminder).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
    expect(r.reply).not.toMatch(/playing/i)
    expect(r.reply).toBe(`Done. Saved reminder "Call Mama". ${MUSIC_REPLIES.not_found}`)
    expect(vi.mocked(addPageMessage).mock.calls[0][3]).toBe(r.reply)
  })
  it('a lone play_music that fails replies with only the error', async () => {
    const r = await applyEchoResponseWithMusic(
      'u',
      'p',
      { reply: 'Playing lofi.', actions: [{ type: 'play_music', query: 'lofi' }], memories: [], trace: [] },
      async () => ({ ok: false, error: 'not_configured', reply: MUSIC_REPLIES.not_configured }),
      vi.fn(),
    )
    expect(r.reply).toBe(MUSIC_REPLIES.not_configured)
  })
})
