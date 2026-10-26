import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { open, seal } from './sealed'
import { authorizeUrl, NONCE_COOKIE } from './tavily-oauth'
import { GET as callback } from '@/app/api/connectors/web-search/callback/route'
import { POST as verify } from '@/app/api/connectors/web-search/verify/route'
import { POST as start } from '@/app/api/connectors/web-search/start/route'

// Hoisted above the imports by vitest.
vi.mock('@/lib/server/verify-user', () => ({ verifyUser: vi.fn(async () => ({ uid: 'uid-1' })) }))

const SECRET = Buffer.alloc(32, 7).toString('base64')
const ORIGIN = 'http://localhost:3000'
const REDIRECT = `${ORIGIN}/api/connectors/web-search/callback`

beforeEach(() => {
  vi.stubEnv('CONNECTOR_SECRET', SECRET)
  vi.stubEnv('TAVILY_CLIENT_ID', 'client-123')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const callbackReq = (state: string, cookie?: string) =>
  new NextRequest(`${REDIRECT}?code=c&state=${encodeURIComponent(state)}`, cookie ? { headers: { cookie: `${NONCE_COOKIE}=${cookie}` } } : undefined)
const stateFor = (nonce: string) => new URL(authorizeUrl('uid-1', REDIRECT, nonce)).searchParams.get('state')!
const clearsCookie = (res: Response) => expect(res.headers.get('set-cookie') ?? '').toMatch(new RegExp(`${NONCE_COOKIE}=;.*Max-Age=0`, 'i'))

describe('start route', () => {
  it('sets an HttpOnly SameSite=Lax nonce cookie that matches the sealed state', async () => {
    const res = await start(new Request(`${ORIGIN}/api/connectors/web-search/start`, { method: 'POST', headers: { authorization: 'Bearer t' } }))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toMatch(/Path=\/api\/connectors\/web-search/)
    expect(cookie).toMatch(/Max-Age=600/)
    const nonce = new RegExp(`${NONCE_COOKIE}=([^;]+)`).exec(cookie)![1]
    const { url } = await res.json()
    const state = open<{ nonce: string }>(new URL(url).searchParams.get('state')!, 'tavily-oauth-state', SECRET)!
    expect(state.nonce).toBe(nonce)
  })
})

describe('callback route', () => {
  it('rejects a missing login cookie without calling Tavily, and clears the cookie', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const res = await callback(callbackReq(stateFor('n1')))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?view=Connectors&tavily=failed`)
    expect(f).not.toHaveBeenCalled()
    clearsCookie(res)
  })

  it('rejects a mismatched login cookie without calling Tavily', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const res = await callback(callbackReq(stateFor('n1'), 'n2'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?view=Connectors&tavily=failed`)
    expect(f).not.toHaveBeenCalled()
    clearsCookie(res)
  })

  it('with a matching cookie, redirects with tokens sealed for the uid in the fragment', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ access_token: 'acc', refresh_token: 'ref', expires_in: 86400 })))
    const res = await callback(callbackReq(stateFor('n1'), 'n1'))
    const location = res.headers.get('location')!
    expect(location.startsWith(`${ORIGIN}/?view=Connectors#web-search=`)).toBe(true)
    const sealed = location.split('#web-search=')[1]
    expect(open<{ access: string }>(sealed, 'uid-1', SECRET)?.access).toBe('acc')
    clearsCookie(res)
  })
})

describe('verify route', () => {
  const verifyReq = (sealed: string) => {
    const body = JSON.stringify({ sealed })
    return new Request(`${ORIGIN}/api/connectors/web-search/verify`, {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'content-length': String(body.length) },
      body,
    })
  }
  const tokens = { access: 'a', refresh: 'r', expiresAt: Date.now() + 86400_000 }

  it('accepts tokens sealed for the caller', async () => {
    expect((await verify(verifyReq(seal(tokens, 'uid-1', SECRET)))).status).toBe(204)
  })

  it('rejects tokens sealed for another uid, junk, and non-token values', async () => {
    expect((await verify(verifyReq(seal(tokens, 'uid-2', SECRET)))).status).toBe(400)
    expect((await verify(verifyReq('v1.junk.junk'))).status).toBe(400)
    expect((await verify(verifyReq(seal({ hello: 1 }, 'uid-1', SECRET)))).status).toBe(400)
  })
})
