import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TavilyError } from './tavily'
import { TavilyAuthError } from './tavily-oauth'
import { takeSearchSlot } from './web-answer'
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
  it('shares the rate limiter with typed chat', async () => {
    for (let i = 0; i < 20; i++) takeSearchSlot('uid-s')
    expect((await call({ query: 'q', sealed: 's' })).error).toBe('rate_limited')
    expect(mocks.search).not.toHaveBeenCalled()
  })
})
