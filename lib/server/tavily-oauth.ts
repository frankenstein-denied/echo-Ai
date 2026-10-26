import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { open, seal, validSecret } from './sealed'

// OAuth 2.1 (public client, PKCE S256) against Tavily's remote MCP server. No server storage: the PKCE verifier
// travels sealed inside `state`, tokens travel sealed (uid as AAD) to the browser and back.
// Never log tokens, codes, state or sealed values.
const AUTHORIZE_URL = 'https://mcp.tavily.com/authorize'
const TOKEN_URL = 'https://mcp.tavily.com/token'
const REVOKE_URL = 'https://mcp.tavily.com/revoke'
const SCOPE = 'openid offline_access'
const STATE_TTL_MS = 10 * 60_000
const REFRESH_MARGIN_MS = 60_000
const HTTP_TIMEOUT_MS = 8000
const CALLBACK_PATH = '/api/connectors/web-search/callback'
const REGISTERED_REDIRECTS = [`https://echo-ai-blue.vercel.app${CALLBACK_PATH}`, `http://localhost:3000${CALLBACK_PATH}`]

/** The callback has no ID token, so state is sealed for a fixed purpose; the uid lives inside it. */
export const STATE_AAD = 'tavily-oauth-state'

export type TavilyTokens = { access: string; refresh: string; expiresAt: number }
type LoginState = { uid: string; verifier: string; redirectUri: string; nonce: string; expiresAt: number }

/** Browser binding for a login: a random nonce kept in an HttpOnly cookie and inside the sealed state. */
export const NONCE_COOKIE = 'echo_tavily_oauth'
export const newNonce = () => randomBytes(32).toString('base64url')

function sameNonce(a: string, b: string): boolean {
  const h = (x: string) => createHash('sha256').update(x).digest()
  return timingSafeEqual(h(a), h(b))
}

export class TavilyAuthError extends Error {
  constructor(public kind: 'expired_state' | 'denied' | 'refused') {
    super(`Tavily login ${kind}`)
    this.name = 'TavilyAuthError'
  }
}

/** The registered callback URI for a request origin, or null when the origin is not registered. */
export function redirectUriFor(origin: string): string | null {
  const uri = `${origin}${CALLBACK_PATH}`
  return REGISTERED_REDIRECTS.includes(uri) ? uri : null
}

function clientId(): string {
  const id = process.env.TAVILY_CLIENT_ID
  if (!id) throw new Error('TAVILY_CLIENT_ID is not set')
  return id
}

export function authorizeUrl(uid: string, redirectUri: string, nonce: string): string {
  const id = clientId()
  const verifier = randomBytes(32).toString('base64url')
  const state: LoginState = { uid, verifier, redirectUri, nonce, expiresAt: Date.now() + STATE_TTL_MS }
  const u = new URL(AUTHORIZE_URL)
  // No `resource` parameter: with it Tavily's login returns access_denied.
  u.search = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state: seal(state, STATE_AAD),
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString()
  return u.toString()
}

async function postToken(params: Record<string, string>, f: typeof fetch, previousRefresh = ''): Promise<TavilyTokens> {
  let res: Response
  try {
    res = await f(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
  } catch {
    // Network error or timeout: never let a hung Tavily hold the request open.
    throw new TavilyAuthError('refused')
  }
  // Any non-200 (400 invalid_grant, or the 5xx Tavily's refresh returns today) means: log in again.
  if (res.status !== 200) throw new TavilyAuthError('refused')
  const d = (await res.json().catch(() => null)) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown } | null
  if (!d || typeof d.access_token !== 'string' || !d.access_token) throw new TavilyAuthError('refused')
  const expiresIn = typeof d.expires_in === 'number' && d.expires_in > 0 ? d.expires_in : 3600
  return {
    access: d.access_token,
    refresh: typeof d.refresh_token === 'string' && d.refresh_token ? d.refresh_token : previousRefresh,
    expiresAt: Date.now() + expiresIn * 1000,
  }
}

/** `nonce` is the login cookie's value; it must match the one sealed in `state` (same browser that started). */
export async function exchangeCode(code: string, state: string, redirectUri: string, nonce: string, f: typeof fetch = fetch): Promise<{ uid: string; tokens: TavilyTokens }> {
  const s = open<LoginState>(state, STATE_AAD)
  if (!s || typeof s.uid !== 'string' || !s.uid || typeof s.verifier !== 'string' || s.redirectUri !== redirectUri) throw new TavilyAuthError('denied')
  if (typeof s.nonce !== 'string' || !s.nonce || !nonce || !sameNonce(s.nonce, nonce)) throw new TavilyAuthError('denied')
  if (!(s.expiresAt > Date.now())) throw new TavilyAuthError('expired_state')
  const tokens = await postToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId(), code_verifier: s.verifier }, f)
  return { uid: s.uid, tokens }
}

export async function refreshTokens(t: TavilyTokens, f: typeof fetch = fetch): Promise<TavilyTokens> {
  if (!t.refresh) throw new TavilyAuthError('refused')
  return postToken({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: clientId() }, f, t.refresh)
}

/** Best effort: revoking at Tavily never fails the user's disconnect. */
export async function revoke(t: TavilyTokens, f: typeof fetch = fetch): Promise<void> {
  if (!t.refresh) return
  try {
    const res = await f(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: t.refresh, token_type_hint: 'refresh_token', client_id: clientId() }).toString(),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    if (!res.ok) console.warn('[tavily] revoke failed:', res.status)
  } catch {
    console.warn('[tavily] revoke failed or timed out')
  }
}

/** Opens the user's sealed tokens, refreshing them when they expire within 60 s (then `resealed` is set). */
export async function withFreshTokens(sealed: string, uid: string, f: typeof fetch = fetch): Promise<{ tokens: TavilyTokens; resealed?: string }> {
  const tokens = open<TavilyTokens>(sealed, uid)
  if (!tokens || typeof tokens.access !== 'string' || typeof tokens.expiresAt !== 'number') throw new TavilyAuthError('refused')
  if (tokens.expiresAt - Date.now() >= REFRESH_MARGIN_MS) return { tokens }
  const fresh = await refreshTokens(tokens, f)
  return { tokens: fresh, resealed: seal(fresh, uid) }
}

/** Name of the first missing (or, for CONNECTOR_SECRET, invalid) server env var the Tavily login needs, or null. */
export function missingTavilyEnv(): string | null {
  if (!process.env.TAVILY_CLIENT_ID) return 'TAVILY_CLIENT_ID'
  if (!validSecret(process.env.CONNECTOR_SECRET)) return 'CONNECTOR_SECRET'
  return null
}

/** Whether `sealed` opens for `uid` as Tavily tokens. */
export function opensAsTokens(sealed: string, uid: string): boolean {
  const t = open<TavilyTokens>(sealed, uid)
  return !!t && typeof t.access === 'string' && !!t.access && typeof t.refresh === 'string' && typeof t.expiresAt === 'number'
}
