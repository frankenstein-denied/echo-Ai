import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LookupError } from './lookup-sources'
import { POST } from '@/app/api/lookup/route'

vi.mock('@/lib/server/verify-user', () => ({ verifyUser: vi.fn(async () => ({ uid: 'uid-l' })) }))
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), slot: vi.fn(() => true) }))
vi.mock('@/lib/server/lookup-sources', async (orig) => ({ ...(await orig<typeof import('./lookup-sources')>()), fetchLookup: mocks.fetch }))
vi.mock('@/lib/server/lookup', async (orig) => ({ ...(await orig<typeof import('./lookup')>()), takeLookupSlot: mocks.slot }))

const req = (body: unknown) => {
  const b = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request('http://localhost/api/lookup', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'content-length': String(b.length) }, body: b })
}
const hit = [{ title: 'Rizal', url: 'https://en.wikipedia.org/wiki/Rizal', content: 'c' }]

beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue(hit)
  mocks.slot.mockReset().mockReturnValue(true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('POST /api/lookup', () => {
  it('returns results with no-store', async () => {
    const res = await POST(req({ source: 'wikipedia', query: '  rizal ' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ results: hit })
    expect(mocks.fetch.mock.calls[0].slice(0, 2)).toEqual(['wikipedia', 'rizal'])
    expect(mocks.slot).toHaveBeenCalledWith('uid-l')
  })
  it('validates source and query', async () => {
    expect((await POST(req({ source: 'imdb', query: 'x' }))).status).toBe(400)
    expect((await POST(req({ source: 'news', query: '' }))).status).toBe(400)
    expect((await POST(req({ source: 'news', query: 'x'.repeat(201) }))).status).toBe(400)
    expect((await POST(req('{nope'))).status).toBe(400)
  })
  it('answers unavailable on a source error or the hourly limit', async () => {
    mocks.fetch.mockRejectedValueOnce(new LookupError('not_configured'))
    expect(await (await POST(req({ source: 'news', query: 'x' }))).json()).toEqual({ error: 'unavailable' })
    mocks.slot.mockReturnValueOnce(false)
    const limited = await POST(req({ source: 'news', query: 'x' }))
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'unavailable' })
  })
})
