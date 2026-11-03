import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { open } from './sealed'
import { loginUrl, MUSIC_NONCE_COOKIE, MUSIC_STATE_AAD } from './lastfm-login'
import { GET as callback } from '@/app/api/connectors/music/lastfm/callback/route'
import { POST as start } from '@/app/api/connectors/music/lastfm/start/route'

vi.mock('@/lib/server/verify-user', () => ({ verifyUser: vi.fn(async () => ({ uid: 'uid-1' })) }))

const SECRET = Buffer.alloc(32, 7).toString('base64')
const ORIGIN = 'http://localhost:3000'
const CB = `${ORIGIN}/api/connectors/music/lastfm/callback`

beforeEach(() => {
  vi.stubEnv('CONNECTOR_SECRET', SECRET)
  vi.stubEnv('LASTFM_API_KEY', 'key')
  vi.stubEnv('LASTFM_API_SECRET', 'secret')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const stateFor = (nonce: string) => new URL(new URL(loginUrl('uid-1', CB, nonce)).searchParams.get('cb')!).searchParams.get('state')!
const cbReq = (qs: string, cookie?: string) => new NextRequest(`${CB}?${qs}`, cookie ? { headers: { cookie: `${MUSIC_NONCE_COOKIE}=${cookie}` } } : undefined)
const clearsCookie = (res: Response) => expect(res.headers.get('set-cookie') ?? '').toMatch(new RegExp(`${MUSIC_NONCE_COOKIE}=;.*Max-Age=0`, 'i'))
const lastfmOk = (name = 'bob') => vi.fn(async () => Response.json({ session: { name, key: 'sk' } }))
const FAILED = `${ORIGIN}/?view=Connectors&music=failed`

describe('lastfm start route', () => {
  const post = () => start(new Request(`${ORIGIN}/api/connectors/music/lastfm/start`, { method: 'POST', headers: { authorization: 'Bearer t' } }))

  it('sets a scoped HttpOnly nonce cookie matching the sealed state in cb', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toMatch(/Path=\/api\/connectors\/music/)
    expect(cookie).toMatch(/Max-Age=600/)
    const nonce = new RegExp(`${MUSIC_NONCE_COOKIE}=([^;]+)`).exec(cookie)![1]
    const { url } = await res.json()
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://www.last.fm/api/auth/')
    const cb = new URL(u.searchParams.get('cb')!)
    expect(cb.origin + cb.pathname).toBe(CB)
    const state = open<{ uid: string; nonce: string }>(cb.searchParams.get('state')!, MUSIC_STATE_AAD, SECRET)!
    expect(state.nonce).toBe(nonce)
    expect(state.uid).toBe('uid-1')
  })

  it('answers not_configured when Last.fm env vars are missing, logging only names', async () => {
    vi.stubEnv('LASTFM_API_SECRET', '')
    const res = await post()
    expect(await res.json()).toEqual({ error: 'not_configured' })
    expect(res.headers.get('set-cookie')).toBeNull()
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(logged).toContain('LASTFM_API_SECRET')
    expect(logged).not.toContain(SECRET)
  })

  it('rejects an unregistered origin', async () => {
    const res = await start(new Request('https://evil.example/api/connectors/music/lastfm/start', { method: 'POST', headers: { authorization: 'Bearer t' } }))
    expect(res.status).toBe(400)
  })
})

describe('lastfm callback route', () => {
  it('rejects a missing cookie without calling Last.fm, and clears the cookie', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const res = await callback(cbReq(`token=t&state=${encodeURIComponent(stateFor('n1'))}`))
    expect(res.headers.get('location')).toBe(FAILED)
    expect(f).not.toHaveBeenCalled()
    clearsCookie(res)
  })

  it('rejects a mismatched cookie without calling Last.fm', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const res = await callback(cbReq(`token=t&state=${encodeURIComponent(stateFor('n1'))}`, 'n2'))
    expect(res.headers.get('location')).toBe(FAILED)
    expect(f).not.toHaveBeenCalled()
    clearsCookie(res)
  })

  it('rejects a forged state and a missing token', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect((await callback(cbReq('token=t&state=v1.junk.junk', 'n1'))).headers.get('location')).toBe(FAILED)
    expect((await callback(cbReq(`state=${encodeURIComponent(stateFor('n1'))}`, 'n1'))).headers.get('location')).toBe(FAILED)
    expect(f).not.toHaveBeenCalled()
  })

  it('with a matching cookie, redirects with the username in the fragment and no-store headers', async () => {
    vi.stubGlobal('fetch', lastfmOk('Bob Smith'))
    const res = await callback(cbReq(`token=t&state=${encodeURIComponent(stateFor('n1'))}`, 'n1'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?view=Connectors#music=lastfm:${encodeURIComponent('Bob Smith')}`)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    clearsCookie(res)
  })

  it('reports an expired state and a Last.fm failure', async () => {
    const state = stateFor('n1')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 11 * 60_000)
    vi.stubGlobal('fetch', lastfmOk())
    const expired = await callback(cbReq(`token=t&state=${encodeURIComponent(state)}`, 'n1'))
    vi.useRealTimers()
    expect(expired.headers.get('location')).toBe(`${ORIGIN}/?view=Connectors&music=expired`)
    clearsCookie(expired)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 4, message: 'x' })))
    const failed = await callback(cbReq(`token=t&state=${encodeURIComponent(stateFor('n1'))}`, 'n1'))
    expect(failed.headers.get('location')).toBe(FAILED)
    clearsCookie(failed)
  })

  it('treats a cancelled login (no token) as cancelled only when Last.fm sends no token and no state', async () => {
    const res = await callback(cbReq(''))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?view=Connectors&music=cancelled`)
    clearsCookie(res)
  })
})
