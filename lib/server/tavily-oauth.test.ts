import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { open, seal } from './sealed'
import { authorizeUrl, exchangeCode, missingTavilyEnv, redirectUriFor, refreshTokens, revoke, STATE_AAD, TavilyAuthError, withFreshTokens, type TavilyTokens } from './tavily-oauth'

const SECRET = Buffer.alloc(32, 7).toString('base64')
const NONCE = 'browser-nonce'
const REDIRECT = 'http://localhost:3000/api/connectors/web-search/callback'

type Call = { url: string; body: URLSearchParams }
function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(String(init.body)) })
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { f, calls }
}

/** A fetch that never answers until its signal aborts. */
const hang = (async (_url: string, init: RequestInit) =>
  new Promise<Response>((_, reject) => {
    const signal = init.signal!
    if (signal.aborted) reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason))
  })) as unknown as typeof fetch

beforeEach(() => {
  vi.stubEnv('CONNECTOR_SECRET', SECRET)
  vi.stubEnv('TAVILY_CLIENT_ID', 'client-123')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('redirectUriFor', () => {
  it('allows only the two registered callback URIs', () => {
    expect(redirectUriFor('http://localhost:3000')).toBe(REDIRECT)
    expect(redirectUriFor('https://echo-ai-blue.vercel.app')).toBe('https://echo-ai-blue.vercel.app/api/connectors/web-search/callback')
    expect(redirectUriFor('https://evil.example')).toBeNull()
    expect(redirectUriFor('http://localhost:3001')).toBeNull()
  })
})

describe('missingTavilyEnv', () => {
  it('names the first missing variable', () => {
    expect(missingTavilyEnv()).toBeNull()
    vi.stubEnv('CONNECTOR_SECRET', 'too-short')
    expect(missingTavilyEnv()).toBe('CONNECTOR_SECRET')
    vi.stubEnv('CONNECTOR_SECRET', '')
    expect(missingTavilyEnv()).toBe('CONNECTOR_SECRET')
    vi.stubEnv('TAVILY_CLIENT_ID', '')
    expect(missingTavilyEnv()).toBe('TAVILY_CLIENT_ID')
  })
})

describe('authorizeUrl', () => {
  it('builds a PKCE S256 URL with the scopes, redirect and a sealed state', () => {
    const u = new URL(authorizeUrl('uid-1', REDIRECT, NONCE))
    expect(u.origin + u.pathname).toBe('https://mcp.tavily.com/authorize')
    const p = u.searchParams
    expect(p.get('response_type')).toBe('code')
    expect(p.get('client_id')).toBe('client-123')
    expect(p.get('redirect_uri')).toBe(REDIRECT)
    expect(p.get('scope')).toBe('openid offline_access')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.has('resource')).toBe(false)
    const state = open<{ uid: string; verifier: string; redirectUri: string; nonce: string; expiresAt: number }>(p.get('state')!, STATE_AAD, SECRET)!
    expect(state.uid).toBe('uid-1')
    expect(state.nonce).toBe(NONCE)
    expect(state.redirectUri).toBe(REDIRECT)
    expect(state.expiresAt).toBeGreaterThan(Date.now() + 9 * 60_000)
    expect(p.get('code_challenge')).toBe(createHash('sha256').update(state.verifier).digest('base64url'))
  })

  it('throws without a client id', () => {
    vi.stubEnv('TAVILY_CLIENT_ID', '')
    expect(() => authorizeUrl('uid-1', REDIRECT, NONCE)).toThrow(/TAVILY_CLIENT_ID/)
  })
})

describe('exchangeCode', () => {
  const tokenBody = { access_token: 'acc', refresh_token: 'ref', expires_in: 86400, token_type: 'Bearer' }

  it('posts grant_type=authorization_code with the verifier and returns the uid and tokens', async () => {
    const state = new URL(authorizeUrl('uid-1', REDIRECT, NONCE)).searchParams.get('state')!
    const { verifier } = open<{ verifier: string }>(state, STATE_AAD, SECRET)!
    const { f, calls } = fakeFetch(200, tokenBody)
    const before = Date.now()
    const out = await exchangeCode('the-code', state, REDIRECT, NONCE, f)
    expect(out.uid).toBe('uid-1')
    expect(out.tokens.access).toBe('acc')
    expect(out.tokens.refresh).toBe('ref')
    expect(out.tokens.expiresAt).toBeGreaterThanOrEqual(before + 86400_000)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://mcp.tavily.com/token')
    const b = calls[0].body
    expect(b.get('grant_type')).toBe('authorization_code')
    expect(b.get('code')).toBe('the-code')
    expect(b.get('code_verifier')).toBe(verifier)
    expect(b.get('redirect_uri')).toBe(REDIRECT)
    expect(b.get('client_id')).toBe('client-123')
  })

  it('rejects an expired state with expired_state and does not call Tavily', async () => {
    const state = seal({ uid: 'uid-1', verifier: 'v', redirectUri: REDIRECT, nonce: NONCE, expiresAt: Date.now() - 1 }, STATE_AAD, SECRET)
    const { f, calls } = fakeFetch(200, tokenBody)
    await expect(exchangeCode('c', state, REDIRECT, NONCE, f)).rejects.toMatchObject({ kind: 'expired_state' })
    expect(calls).toHaveLength(0)
  })

  it('rejects a tampered state or a different redirect with denied', async () => {
    const { f } = fakeFetch(200, tokenBody)
    await expect(exchangeCode('c', 'v1.junk.junk', REDIRECT, NONCE, f)).rejects.toMatchObject({ kind: 'denied' })
    const state = new URL(authorizeUrl('uid-1', REDIRECT, NONCE)).searchParams.get('state')!
    await expect(exchangeCode('c', state, 'https://echo-ai-blue.vercel.app/api/connectors/web-search/callback', NONCE, f)).rejects.toMatchObject({ kind: 'denied' })
  })

  it('rejects a missing or different browser nonce with denied and does not call Tavily', async () => {
    const state = new URL(authorizeUrl('uid-1', REDIRECT, NONCE)).searchParams.get('state')!
    const { f, calls } = fakeFetch(200, tokenBody)
    await expect(exchangeCode('c', state, REDIRECT, 'other-nonce', f)).rejects.toMatchObject({ kind: 'denied' })
    await expect(exchangeCode('c', state, REDIRECT, '', f)).rejects.toMatchObject({ kind: 'denied' })
    expect(calls).toHaveLength(0)
  })

  it('times out a hung token request as refused', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => AbortSignal.abort())
    const state = new URL(authorizeUrl('uid-1', REDIRECT, NONCE)).searchParams.get('state')!
    await expect(exchangeCode('c', state, REDIRECT, NONCE, hang)).rejects.toMatchObject({ kind: 'refused' })
    expect(timeout).toHaveBeenCalledWith(8000)
    timeout.mockRestore()
  })

  it('maps a refused token request to refused', async () => {
    const state = new URL(authorizeUrl('uid-1', REDIRECT, NONCE)).searchParams.get('state')!
    const { f } = fakeFetch(400, { error: 'invalid_grant' })
    const err = await exchangeCode('c', state, REDIRECT, NONCE, f).catch((e) => e)
    expect(err).toBeInstanceOf(TavilyAuthError)
    expect(err.kind).toBe('refused')
  })
})

describe('refreshTokens', () => {
  const t: TavilyTokens = { access: 'old', refresh: 'ref', expiresAt: 0 }

  it('posts grant_type=refresh_token and keeps the old refresh token when none is returned', async () => {
    const { f, calls } = fakeFetch(200, { access_token: 'new', expires_in: 3600 })
    const out = await refreshTokens(t, f)
    expect(out.access).toBe('new')
    expect(out.refresh).toBe('ref')
    const b = calls[0].body
    expect(b.get('grant_type')).toBe('refresh_token')
    expect(b.get('refresh_token')).toBe('ref')
    expect(b.get('client_id')).toBe('client-123')
  })

  it('maps 400 invalid_grant and 5xx to refused', async () => {
    await expect(refreshTokens(t, fakeFetch(400, { error: 'invalid_grant' }).f)).rejects.toMatchObject({ kind: 'refused' })
    await expect(refreshTokens(t, fakeFetch(500, { error: 'server_error' }).f)).rejects.toMatchObject({ kind: 'refused' })
  })
})

describe('withFreshTokens', () => {
  it('returns the tokens unchanged when they are not near expiry', async () => {
    const tokens = { access: 'a', refresh: 'r', expiresAt: Date.now() + 10 * 60_000 }
    const { f, calls } = fakeFetch(200, {})
    const out = await withFreshTokens(seal(tokens, 'uid-1', SECRET), 'uid-1', f)
    expect(out).toEqual({ tokens })
    expect(calls).toHaveLength(0)
  })

  it('refreshes within 60 s of expiry and returns resealed tokens', async () => {
    const tokens = { access: 'a', refresh: 'r', expiresAt: Date.now() + 30_000 }
    const { f, calls } = fakeFetch(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 86400 })
    const out = await withFreshTokens(seal(tokens, 'uid-1', SECRET), 'uid-1', f)
    expect(calls).toHaveLength(1)
    expect(out.tokens.access).toBe('a2')
    expect(open(out.resealed!, 'uid-1', SECRET)).toEqual(out.tokens)
  })

  it('throws refused for a sealed value of another uid or a refused refresh', async () => {
    const tokens = { access: 'a', refresh: 'r', expiresAt: 0 }
    await expect(withFreshTokens(seal(tokens, 'uid-1', SECRET), 'uid-2', fakeFetch(200, {}).f)).rejects.toMatchObject({ kind: 'refused' })
    await expect(withFreshTokens(seal(tokens, 'uid-1', SECRET), 'uid-1', fakeFetch(400, { error: 'invalid_grant' }).f)).rejects.toMatchObject({ kind: 'refused' })
  })
})

describe('revoke', () => {
  it('posts the refresh token and never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { f, calls } = fakeFetch(500, {})
    await expect(revoke({ access: 'a', refresh: 'r', expiresAt: 0 }, f)).resolves.toBeUndefined()
    expect(calls[0].url).toBe('https://mcp.tavily.com/revoke')
    expect(calls[0].body.get('token')).toBe('r')
    expect(calls[0].body.get('token_type_hint')).toBe('refresh_token')
    expect(calls[0].body.get('client_id')).toBe('client-123')
    const boom = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    await expect(revoke({ access: 'a', refresh: 'r', expiresAt: 0 }, boom)).resolves.toBeUndefined()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => AbortSignal.abort())
    await expect(revoke({ access: 'a', refresh: 'r', expiresAt: 0 }, hang)).resolves.toBeUndefined()
    expect(timeout).toHaveBeenCalledWith(8000)
    expect(warn).toHaveBeenLastCalledWith('[tavily] revoke failed or timed out')
    timeout.mockRestore()
    warn.mockRestore()
  })
})
