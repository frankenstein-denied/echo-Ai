import { describe, expect, it, vi } from 'vitest'
import { formatListening, listenbrainzListening, listenbrainzUserExists, youtubeEmbedUrl, youtubeMusicUrl } from './music'

const res = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

describe('urls', () => {
  it('builds embed and music urls', () => {
    expect(youtubeEmbedUrl('abc', true)).toBe('https://www.youtube-nocookie.com/embed/abc?autoplay=1')
    expect(youtubeEmbedUrl('abc', false)).toBe('https://www.youtube-nocookie.com/embed/abc?autoplay=0')
    expect(youtubeMusicUrl('abc')).toBe('https://music.youtube.com/watch?v=abc')
  })
})

describe('formatListening', () => {
  it('formats both lines', () => {
    const t = formatListening({
      recent: [{ title: 'Song', artist: 'Art' }, { title: 'S2', artist: 'A2' }],
      topArtists: [{ name: 'A', plays: 42 }, { name: 'B', plays: 17 }],
    })
    expect(t).toBe('Top artists this week: A (42 plays), B (17)\nRecently played: Song — Art; S2 — A2')
  })
  it('caps at 400 chars and handles empty', () => {
    const recent = Array.from({ length: 30 }, (_, i) => ({ title: `Long song title number ${i}`, artist: 'Some Artist' }))
    expect(formatListening({ recent, topArtists: [] }).length).toBeLessThanOrEqual(400)
    expect(formatListening({ recent: [], topArtists: [] })).toBe('')
  })
})

describe('listenbrainz', () => {
  it('checks existence', async () => {
    const ok = vi.fn(async () => res({ payload: { count: 5 } })) as unknown as typeof fetch
    expect(await listenbrainzUserExists('rj', ok)).toBe(true)
    expect(String((ok as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('/user/rj/listen-count')
    expect(await listenbrainzUserExists('nobody', (async () => res({}, 404)) as unknown as typeof fetch)).toBe(false)
  })
  it('throws when the check itself fails (network error, abort, other non-OK)', async () => {
    await expect(listenbrainzUserExists('x', (async () => { throw new Error('net') }) as unknown as typeof fetch)).rejects.toThrow()
    await expect(listenbrainzUserExists('x', (async () => { throw new DOMException('aborted', 'AbortError') }) as unknown as typeof fetch)).rejects.toThrow()
    await expect(listenbrainzUserExists('x', (async () => res({}, 500)) as unknown as typeof fetch)).rejects.toThrow()
    await expect(listenbrainzUserExists('x', (async () => res({}, 429)) as unknown as typeof fetch)).rejects.toThrow()
  })
  it('parses listens and top artists', async () => {
    const f = vi.fn(async (url: string) =>
      String(url).includes('/listens')
        ? res({ payload: { listens: [{ track_metadata: { track_name: 'T', artist_name: 'Ar' } }] } })
        : res({ payload: { artists: [{ artist_name: 'Ar', listen_count: 9 }] } }),
    ) as unknown as typeof fetch
    expect(await listenbrainzListening('rj', f)).toEqual({ recent: [{ title: 'T', artist: 'Ar' }], topArtists: [{ name: 'Ar', plays: 9 }] })
  })
  it('treats 204 stats as no top artists', async () => {
    const f = (async (url: string) =>
      String(url).includes('/listens') ? res({ payload: { listens: [] } }) : res(null, 204)) as unknown as typeof fetch
    expect(await listenbrainzListening('rj', f)).toEqual({ recent: [], topArtists: [] })
  })
})
