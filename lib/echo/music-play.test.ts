import { describe, expect, it, vi } from 'vitest'
import { findTrack, LINK_TITLE, MUSIC_REPLIES, musicToolOutput, resolvePlayMusic } from './music-play'
import type { EchoResponse } from './types'

const user = { getIdToken: async () => 'tok' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ID = 'dQw4w9WgXcQ'
const res = (query: string, reply = 'Playing lofi beats.'): EchoResponse => ({ reply, actions: [{ type: 'play_music', query }], memories: [], trace: [] })

describe('findTrack', () => {
  it('plays a pasted link directly and never calls the search route', async () => {
    const f = vi.fn()
    expect(await findTrack(user, `https://music.youtube.com/watch?v=${ID}&si=x`, { fetchImpl: f as never })).toEqual({ ok: true, track: { videoId: ID, title: LINK_TITLE } })
    expect(f).not.toHaveBeenCalled()
    expect(LINK_TITLE).toBe('YouTube video')
  })
  it("uses the link in the user's own message when the query has none", async () => {
    const f = vi.fn()
    const r = await findTrack(user, 'that video', { text: `play this https://youtu.be/${ID}`, fetchImpl: f as never })
    expect(r).toEqual({ ok: true, track: { videoId: ID, title: LINK_TITLE } })
    expect(f).not.toHaveBeenCalled()
  })
  it('searches by name through POST /api/music/search with the token', async () => {
    const f = vi.fn(async () => json({ videoId: ID, title: 'Lofi Girl', channel: 'Lofi Records' }))
    const r = await findTrack(user, 'lofi beats', { fetchImpl: f as never })
    expect(r).toEqual({ ok: true, track: { videoId: ID, title: 'Lofi Girl', channel: 'Lofi Records' } })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/music/search')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(String(init.body))).toEqual({ query: 'lofi beats' })
  })
  it('without the YouTube key says to paste a link', async () => {
    const r = await findTrack(user, 'lofi beats', { fetchImpl: (async () => json({ error: 'not_configured' })) as never })
    expect(r).toEqual({ ok: false, error: 'not_configured', reply: MUSIC_REPLIES.not_configured })
    expect(MUSIC_REPLIES.not_configured).toBe("Searching by song name isn't set up yet — paste a YouTube or YouTube Music link and I'll play it.")
  })
  it('maps each error to its fixed reply, and anything unexpected to failed', async () => {
    expect(MUSIC_REPLIES.not_found).toBe("I couldn't find that song.")
    for (const [body, status, error] of [
      [{ error: 'not_found' }, 200, 'not_found'],
      [{ error: 'quota' }, 429, 'quota'],
      [{ error: 'rate_limited' }, 429, 'rate_limited'],
      [{ error: 'failed' }, 502, 'failed'],
      [{ error: 'Invalid query' }, 400, 'failed'],
      [{ error: 'secret raw <b>' }, 500, 'failed'],
      [{ videoId: 'bad id!', title: 'x' }, 200, 'failed'],
      [{}, 200, 'failed'],
    ] as const) {
      const r = await findTrack(user, 'x', { fetchImpl: (async () => json(body, status)) as never })
      expect(r).toEqual({ ok: false, error, reply: MUSIC_REPLIES[error] })
    }
    const thrown = await findTrack(user, 'x', {
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch')
      }) as never,
    })
    expect(thrown).toEqual({ ok: false, error: 'failed', reply: MUSIC_REPLIES.failed })
  })
  it('caps the title and falls back to the link title', async () => {
    const long = await findTrack(user, 'x', { fetchImpl: (async () => json({ videoId: ID, title: 't'.repeat(500), channel: 5 })) as never })
    expect(long.ok && long.track.title.length).toBeLessThanOrEqual(200)
    expect(long.ok && long.track.channel).toBeUndefined()
    const blank = await findTrack(user, 'x', { fetchImpl: (async () => json({ videoId: ID, title: '' })) as never })
    expect(blank.ok && blank.track.title).toBe(LINK_TITLE)
  })
})

describe('resolvePlayMusic', () => {
  it('passes through a response without play_music untouched', async () => {
    const r: EchoResponse = { reply: 'Hi', actions: [{ type: 'general' }], memories: [], trace: [] }
    const find = vi.fn()
    expect(await resolvePlayMusic(r, find)).toEqual({ res: r })
    expect(find).not.toHaveBeenCalled()
  })
  it('keeps the reply and returns the track on success', async () => {
    const track = { videoId: ID, title: 'Lofi Girl' }
    const out = await resolvePlayMusic(res('lofi'), async () => ({ ok: true, track }))
    expect(out.track).toEqual(track)
    expect(out.res.reply).toBe('Playing lofi beats.')
    const empty = await resolvePlayMusic(res('lofi', ''), async () => ({ ok: true, track }))
    expect(empty.res.reply).toBe('Playing Lofi Girl.')
  })
  it('replaces the reply with the fixed error text and opens nothing', async () => {
    const out = await resolvePlayMusic(res('zzz'), async () => ({ ok: false, error: 'not_found', reply: MUSIC_REPLIES.not_found }))
    expect(out.track).toBeUndefined()
    expect(out.res.reply).toBe("I couldn't find that song.")
  })
  it('with saves too: success keeps the reply, failure drops the playing claim and adds the error after the save confirmation', async () => {
    const both: EchoResponse = {
      reply: "Done, I'll remind you at 8 — playing lofi now.",
      actions: [{ type: 'reminder', title: 'Call Mama', dueAt: '2026-10-25T20:00:00+08:00' }, { type: 'play_music', query: 'lofi' }],
      memories: [],
      trace: [],
    }
    const ok = await resolvePlayMusic(both, async () => ({ ok: true, track: { videoId: ID, title: 'Lofi Girl' } }))
    expect(ok.res.reply).toBe(both.reply)
    expect(ok.replySuffix).toBeUndefined()
    const bad = await resolvePlayMusic(both, async () => ({ ok: false, error: 'not_found', reply: MUSIC_REPLIES.not_found }))
    expect(bad.track).toBeUndefined()
    expect(bad.res.reply).toBe('')
    expect(bad.replySuffix).toBe(MUSIC_REPLIES.not_found)
    expect(bad.res.actions).toEqual(both.actions)
    const quiet = await resolvePlayMusic({ ...both, reply: '' }, async () => ({ ok: true, track: { videoId: ID, title: 'Lofi Girl' } }))
    expect(quiet.res.reply).toBe('')
    expect(quiet.replySuffix).toBe('Playing Lofi Girl.')
  })
  it('never throws: a failing finder is a failed reply', async () => {
    const out = await resolvePlayMusic(res('zzz'), async () => {
      throw new Error('x')
    })
    expect(out.res.reply).toBe(MUSIC_REPLIES.failed)
  })
})

describe('musicToolOutput', () => {
  it('tells the call model the title, or the fixed tell_user', () => {
    expect(musicToolOutput({ ok: true, track: { videoId: ID, title: 'Lofi Girl' } })).toMatchObject({ ok: true, title: 'Lofi Girl' })
    expect(musicToolOutput({ ok: false, error: 'not_found', reply: MUSIC_REPLIES.not_found })).toEqual({ error: 'not_found', tell_user: MUSIC_REPLIES.not_found })
  })
})
