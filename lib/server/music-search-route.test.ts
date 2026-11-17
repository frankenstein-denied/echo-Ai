import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YoutubeError } from './youtube'
import { MUSIC_LIMITS, takeMusicSlot } from './web-answer'
import { verifyUser } from '@/lib/server/verify-user'
import { POST } from '@/app/api/music/search/route'

vi.mock('@/lib/server/verify-user', () => ({ verifyUser: vi.fn(async () => ({ uid: 'uid-m' })) }))
const mocks = vi.hoisted(() => ({ search: vi.fn(), env: vi.fn(() => [] as string[]), slot: vi.fn(() => true) }))
vi.mock('@/lib/server/youtube', async (orig) => ({ ...(await orig<typeof import('./youtube')>()), searchSong: mocks.search, missingYoutubeEnv: mocks.env }))
vi.mock('@/lib/server/web-answer', async (orig) => ({ ...(await orig<typeof import('./web-answer')>()), takeMusicSlot: mocks.slot }))

const req = (body: unknown, len?: number | null) => {
  const b = typeof body === 'string' ? body : JSON.stringify(body)
  const headers: Record<string, string> = { authorization: 'Bearer t', 'content-type': 'application/json' }
  if (len !== null) headers['content-length'] = String(len ?? b.length)
  return new Request('http://localhost/api/music/search', { method: 'POST', headers, body: b })
}
const hit = { videoId: 'dQw4w9WgXcQ', title: 'Song', channel: 'Artist' }

beforeEach(() => {
  mocks.search.mockReset().mockResolvedValue(hit)
  mocks.env.mockReset().mockReturnValue([])
  mocks.slot.mockReset().mockReturnValue(true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

const logged = () => [console.warn, console.error, console.info, console.log].flatMap((f) => vi.mocked(f).mock.calls.flat().map(String)).join('\n')

describe('POST /api/music/search', () => {
  it('returns the hit with no-store and passes the trimmed query', async () => {
    const res = await POST(req({ query: '  lofi beats  ' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual(hit)
    expect(mocks.search.mock.calls[0][0]).toBe('lofi beats')
    expect(mocks.slot).toHaveBeenCalledWith('uid-m')
  })
  it('requires a signed-in user', async () => {
    vi.mocked(verifyUser).mockResolvedValueOnce(null)
    expect((await POST(req({ query: 'q' }))).status).toBe(401)
    expect(mocks.search).not.toHaveBeenCalled()
  })
  it('validates the body', async () => {
    expect((await POST(req({ query: 'q' }, null))).status).toBe(411)
    expect((await POST(req({ query: 'q' }, 99999))).status).toBe(413)
    expect((await POST(req('{nope'))).status).toBe(400)
    expect((await POST(req({ query: '' }))).status).toBe(400)
    expect((await POST(req({ query: '   ' }))).status).toBe(400)
    expect((await POST(req({ query: 42 }))).status).toBe(400)
    expect((await POST(req({}))).status).toBe(400)
    expect((await POST(req(null))).status).toBe(400)
    expect((await POST(req({ query: 'x'.repeat(201) }))).status).toBe(400)
    expect((await POST(req({ query: '' }))).headers.get('cache-control')).toBe('no-store')
    expect((await POST(req('{nope'))).headers.get('cache-control')).toBe('no-store')
    expect((await POST(req({ query: 'x'.repeat(200) }))).status).toBe(200)
    expect(mocks.search).toHaveBeenCalledTimes(1)
  })
  it('answers not_configured without the key, logging only the variable name', async () => {
    mocks.env.mockReturnValue(['YOUTUBE_API_KEY'])
    const res = await POST(req({ query: 'secret song' }))
    expect(await res.json()).toEqual({ error: 'not_configured' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(mocks.search).not.toHaveBeenCalled()
    expect(logged()).toContain('YOUTUBE_API_KEY')
    expect(logged()).not.toContain('secret song')
  })
  it('rate-limits per user', async () => {
    mocks.slot.mockReturnValue(false)
    const res = await POST(req({ query: 'q' }))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
    expect(mocks.search).not.toHaveBeenCalled()
  })
  it('maps no result, quota, timeout and failures to fixed codes and never logs the query', async () => {
    mocks.search.mockResolvedValueOnce(null)
    expect(await (await POST(req({ query: 'secret song' }))).json()).toEqual({ error: 'not_found' })
    mocks.search.mockRejectedValueOnce(new YoutubeError('quota'))
    const q = await POST(req({ query: 'secret song' }))
    expect(q.status).toBe(429)
    expect(await q.json()).toEqual({ error: 'quota' })
    mocks.search.mockRejectedValueOnce(new YoutubeError('timeout'))
    expect(await (await POST(req({ query: 'secret song' }))).json()).toEqual({ error: 'failed' })
    mocks.search.mockRejectedValueOnce(new Error('secret song boom'))
    const f = await POST(req({ query: 'secret song' }))
    expect(f.status).toBe(502)
    expect(await f.json()).toEqual({ error: 'failed' })
    expect(logged()).not.toContain('secret song')
  })
})

describe('takeMusicSlot', () => {
  it('allows 30 per hour per user', async () => {
    const real = (await vi.importActual<typeof import('./web-answer')>('./web-answer')).takeMusicSlot
    expect(MUSIC_LIMITS.perHour).toBe(30)
    const t0 = 1_000_000
    for (let i = 0; i < 30; i++) expect(real('uid-limit', t0 + i)).toBe(true)
    expect(real('uid-limit', t0 + 31)).toBe(false)
    expect(real('uid-other', t0 + 31)).toBe(true)
    expect(real('uid-limit', t0 + MUSIC_LIMITS.windowMs + 1)).toBe(true)
    expect(typeof takeMusicSlot).toBe('function')
  })
})
