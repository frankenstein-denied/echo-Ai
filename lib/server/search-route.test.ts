import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TavilyError } from './tavily'
import { TavilyAuthError } from './tavily-oauth'
import { takeSearchSlot } from './web-answer'
import { verifyUser } from '@/lib/server/verify-user'
import { POST } from '@/app/api/search/route'

vi.mock('@/lib/server/verify-user', () => ({ verifyUser: vi.fn(async () => ({ uid: 'uid-s' })) }))
const mocks = vi.hoisted(() => ({ fresh: vi.fn(), search: vi.fn(), env: vi.fn(() => null as string | null) }))
vi.mock('@/lib/server/tavily-oauth', async (orig) => ({ ...(await orig<typeof import('./tavily-oauth')>()), withFreshTokens: mocks.fresh, missingTavilyEnv: mocks.env }))
vi.mock('@/lib/server/tavily', async (orig) => ({ ...(await orig<typeof import('./tavily')>()), tavilySearch: mocks.search }))

const req = (body: unknown, len?: number) => {
  const b = JSON.stringify(body)
  return new Request('http://localhost/api/search', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'content-length': String(len ?? b.length) }, body: b })
}
const results = Array.from({ length: 7 }, (_, i) => ({ title: `t${i}`, url: `u${i}`, content: 'c' }))
const call = async (body: unknown) => (await POST(req(body))).json()

beforeEach(() => {
  mocks.fresh.mockReset().mockResolvedValue({ tokens: { access: 'a' } })
  mocks.search.mockReset().mockResolvedValue(results)
  mocks.env.mockReset().mockReturnValue(null)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('POST /api/search', () => {
  it('returns at most 5 results and resealed', async () => {
    mocks.fresh.mockResolvedValue({ tokens: { access: 'a' }, resealed: 'new' })
    const j = await call({ query: 'q', sealed: 's' })
    expect(j.results).toHaveLength(5)
    expect(j.resealed).toBe('new')
    expect(mocks.search.mock.calls[0][1]).toBe('q')
  })
  it('validates the body', async () => {
    expect((await POST(req({ query: '', sealed: 's' }))).status).toBe(400)
    expect((await POST(req({ query: 'x'.repeat(301), sealed: 's' }))).status).toBe(400)
    expect((await POST(req({ query: 'q', sealed: 's'.repeat(8193) }))).status).toBe(400)
    expect((await POST(req({ query: 'q', sealed: 's' }, 99999))).status).toBe(413)
  })
  it('is not connected without sealed or env, and logs only the variable name', async () => {
    expect((await call({ query: 'q' })).error).toBe('not_connected')
    mocks.env.mockReturnValue('TAVILY_CLIENT_ID')
    expect((await call({ query: 'q', sealed: 's' })).error).toBe('not_connected')
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toContain('TAVILY_CLIENT_ID')
    expect(mocks.search).not.toHaveBeenCalled()
  })
  it('maps auth, quota and failures', async () => {
    mocks.fresh.mockRejectedValueOnce(new TavilyAuthError('refused'))
    expect((await call({ query: 'q', sealed: 's' })).error).toBe('reconnect')
    mocks.search.mockRejectedValueOnce(new TavilyError('auth'))
    expect((await call({ query: 'q', sealed: 's' })).error).toBe('reconnect')
    mocks.search.mockRejectedValueOnce(new TavilyError('quota'))
    expect((await call({ query: 'q', sealed: 's' })).error).toBe('quota')
    mocks.search.mockRejectedValueOnce(new Error('x'))
    expect((await call({ query: 'q', sealed: 's' })).error).toBe('failed')
    mocks.search.mockResolvedValueOnce([])
    expect((await call({ query: 'q', sealed: 's' })).results).toEqual([])
  })
  it('retries once when the first search times out, then returns results', async () => {
    mocks.search.mockRejectedValueOnce(new TavilyError('timeout'))
    const res = await POST(req({ query: 'q', sealed: 's' }))
    expect(res.status).toBe(200)
    expect((await res.json()).results).toHaveLength(5)
    expect(mocks.search).toHaveBeenCalledTimes(2)
    expect(mocks.search.mock.calls[1][0]).toBe('a')
    expect(mocks.search.mock.calls[1][2].timeoutMs).toBeLessThanOrEqual(8000)
  })
  it('answers waking (504) when both searches time out', async () => {
    mocks.fresh.mockResolvedValue({ tokens: { access: 'a' }, resealed: 'new' })
    mocks.search.mockRejectedValue(new TavilyError('timeout'))
    const res = await POST(req({ query: 'q', sealed: 's' }))
    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({ error: 'waking', resealed: 'new' })
    expect(mocks.search).toHaveBeenCalledTimes(2)
    expect(vi.mocked(console.warn).mock.calls[0]).toEqual(['[search] failed: timeout'])
  })
  it('does not retry a non-timeout failure and takes one rate-limit slot', async () => {
    mocks.search.mockRejectedValueOnce(new TavilyError('failed'))
    expect((await call({ query: 'q', sealed: 's' })).error).toBe('failed')
    expect(mocks.search).toHaveBeenCalledTimes(1)
  })
  it('shares the rate limiter with typed chat', async () => {
    for (let i = 0; i < 20; i++) takeSearchSlot('uid-s')
    expect((await call({ query: 'q', sealed: 's' })).error).toBe('rate_limited')
    expect(mocks.search).not.toHaveBeenCalled()
  })
  it('caps the first attempt to the budget left after auth and token refresh', async () => {
    const t0 = Date.now()
    vi.mocked(verifyUser).mockResolvedValueOnce({ uid: 'uid-cap' } as never)
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    mocks.fresh.mockImplementation(async () => {
      now.mockReturnValue(t0 + 11000)
      return { tokens: { access: 'a' } }
    })
    const res = await POST(req({ query: 'q', sealed: 's' }))
    expect(res.status).toBe(200)
    expect(mocks.search.mock.calls[0][2].timeoutMs).toBeLessThan(8000)
    expect(mocks.search.mock.calls[0][2].timeoutMs).toBeLessThanOrEqual(4000)
  })
  it('answers waking (504) without searching when almost no budget is left', async () => {
    const t0 = Date.now()
    vi.mocked(verifyUser).mockResolvedValueOnce({ uid: 'uid-nobudget' } as never)
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    mocks.fresh.mockImplementation(async () => {
      now.mockReturnValue(t0 + 14500)
      return { tokens: { access: 'a' }, resealed: 'rs' }
    })
    const res = await POST(req({ query: 'q', sealed: 's' }))
    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({ error: 'waking', resealed: 'rs' })
    expect(mocks.search).not.toHaveBeenCalled()
  })
})
