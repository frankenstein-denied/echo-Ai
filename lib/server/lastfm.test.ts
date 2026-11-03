import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiSig, getSession, LastfmError, lastfmAuthUrl, missingLastfmEnv, recentTracks, topArtists } from './lastfm'

const jsonRes = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response
const mockFetch = (body: unknown, status = 200) => vi.fn(async () => jsonRes(body, status)) as unknown as typeof fetch

afterEach(() => vi.unstubAllEnvs())

describe('env + auth url', () => {
  it('reports missing env var names', () => {
    vi.stubEnv('LASTFM_API_KEY', '')
    vi.stubEnv('LASTFM_API_SECRET', '')
    expect(missingLastfmEnv()).toEqual(['LASTFM_API_KEY', 'LASTFM_API_SECRET'])
    vi.stubEnv('LASTFM_API_KEY', 'k')
    vi.stubEnv('LASTFM_API_SECRET', 's')
    expect(missingLastfmEnv()).toEqual([])
  })
  it('builds the web auth url', () => {
    vi.stubEnv('LASTFM_API_KEY', 'abc')
    const u = new URL(lastfmAuthUrl('https://x.test/cb?a=1&b=2'))
    expect(u.origin + u.pathname).toBe('https://www.last.fm/api/auth/')
    expect(u.searchParams.get('api_key')).toBe('abc')
    expect(u.searchParams.get('cb')).toBe('https://x.test/cb?a=1&b=2')
  })
})

describe('apiSig', () => {
  it('matches a known md5 vector, sorted, excluding format/callback', () => {
    const sig = apiSig({ token: 'tok123', method: 'auth.getSession', api_key: 'abc', format: 'json', callback: 'x' }, 'shh')
    expect(sig).toBe('a271f0c5c7467c4f30ab1819610e94d4')
  })
})

describe('getSession', () => {
  it('parses the username and signs the request', async () => {
    vi.stubEnv('LASTFM_API_KEY', 'abc')
    vi.stubEnv('LASTFM_API_SECRET', 'shh')
    const f = mockFetch({ session: { name: 'rj', key: 'sk' } })
    expect(await getSession('tok123', { fetch: f })).toEqual({ username: 'rj' })
    const url = new URL((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(url.searchParams.get('api_sig')).toHaveLength(32)
    expect(url.searchParams.get('format')).toBe('json')
  })
  it('fails on an error body', async () => {
    vi.stubEnv('LASTFM_API_KEY', 'abc')
    vi.stubEnv('LASTFM_API_SECRET', 'shh')
    await expect(getSession('bad', { fetch: mockFetch({ error: 4, message: 'Invalid token' }) })).rejects.toMatchObject({ kind: 'failed' })
  })
})

describe('recentTracks / topArtists', () => {
  it('parses recent tracks with now playing', async () => {
    vi.stubEnv('LASTFM_API_KEY', 'abc')
    const f = mockFetch({
      recenttracks: {
        track: [
          { name: 'Song A', artist: { '#text': 'Art A' }, '@attr': { nowplaying: 'true' } },
          { name: 'Song B', artist: { '#text': 'Art B' } },
        ],
      },
    })
    expect(await recentTracks('rj', 2, { fetch: f })).toEqual([
      { title: 'Song A', artist: 'Art A', nowPlaying: true },
      { title: 'Song B', artist: 'Art B', nowPlaying: false },
    ])
  })
  it('handles a single-object track', async () => {
    vi.stubEnv('LASTFM_API_KEY', 'abc')
    const f = mockFetch({ recenttracks: { track: { name: 'Solo', artist: { '#text': 'X' } } } })
    expect(await recentTracks('rj', 5, { fetch: f })).toEqual([{ title: 'Solo', artist: 'X', nowPlaying: false }])
  })
  it('parses top artists', async () => {
    vi.stubEnv('LASTFM_API_KEY', 'abc')
    const f = mockFetch({ topartists: { artist: [{ name: 'A', playcount: '42' }, { name: 'B', playcount: '17' }] } })
    expect(await topArtists('rj', '7day', 5, { fetch: f })).toEqual([
      { name: 'A', plays: 42 },
      { name: 'B', plays: 17 },
    ])
  })
  it('maps code 6 to not_found', async () => {
    vi.stubEnv('LASTFM_API_KEY', 'abc')
    const err = await recentTracks('nobody', 5, { fetch: mockFetch({ error: 6, message: 'User not found' }) }).catch((e) => e)
    expect(err).toBeInstanceOf(LastfmError)
    expect(err.kind).toBe('not_found')
  })
  it('maps http failure to failed', async () => {
    vi.stubEnv('LASTFM_API_KEY', 'abc')
    await expect(topArtists('rj', '7day', 5, { fetch: mockFetch({}, 500) })).rejects.toMatchObject({ kind: 'failed' })
  })
})
