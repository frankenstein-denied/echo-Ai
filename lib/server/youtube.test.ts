import { afterEach, describe, expect, it, vi } from 'vitest'
import { missingYoutubeEnv, searchSong, YoutubeError } from './youtube'

const jsonRes = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response
const mockFetch = (body: unknown, status = 200) => vi.fn(async () => jsonRes(body, status)) as unknown as typeof fetch

afterEach(() => vi.unstubAllEnvs())

describe('youtube', () => {
  it('reports missing env', () => {
    vi.stubEnv('YOUTUBE_API_KEY', '')
    expect(missingYoutubeEnv()).toEqual(['YOUTUBE_API_KEY'])
    vi.stubEnv('YOUTUBE_API_KEY', 'k')
    expect(missingYoutubeEnv()).toEqual([])
  })
  it('parses a hit, unescapes entities and sends the right params', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'k')
    const f = mockFetch({ items: [{ id: { videoId: 'abc123' }, snippet: { title: 'Rock &amp; Roll &#39;Live&#39; &quot;X&quot; &lt;3', channelTitle: 'Chan' } }] })
    expect(await searchSong('rock & roll', { fetch: f })).toEqual({ videoId: 'abc123', title: `Rock & Roll 'Live' "X" <3`, channel: 'Chan' })
    const u = new URL((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(u.searchParams.get('q')).toBe('rock & roll')
    expect(u.searchParams.get('videoCategoryId')).toBe('10')
    expect(u.searchParams.get('type')).toBe('video')
    expect(u.searchParams.get('maxResults')).toBe('1')
    expect(u.searchParams.get('safeSearch')).toBe('moderate')
  })
  it('returns null with no results', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'k')
    expect(await searchSong('zzz', { fetch: mockFetch({ items: [] }) })).toBeNull()
  })
  it('maps quota exhaustion', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'k')
    const body = { error: { errors: [{ reason: 'quotaExceeded' }] } }
    const err = await searchSong('x', { fetch: mockFetch(body, 403) }).catch((e) => e)
    expect(err).toBeInstanceOf(YoutubeError)
    expect(err.kind).toBe('quota')
  })
  it('maps other failures', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'k')
    await expect(searchSong('x', { fetch: mockFetch({}, 500) })).rejects.toMatchObject({ kind: 'failed' })
  })
})
