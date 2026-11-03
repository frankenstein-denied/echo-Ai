import { createHash, timingSafeEqual } from 'node:crypto'
import { lastfmAuthUrl, getSession } from './lastfm'
import { open, seal } from './sealed'

// "Log in with Last.fm" (web auth). Same security properties as the Tavily login: an HttpOnly nonce cookie binds
// the login to the browser that started it, and the sealed `state` (on the callback URL) carries uid + nonce.
// Never log usernames, tokens, nonces or state.
const STATE_TTL_MS = 10 * 60_000
const CALLBACK_PATH = '/api/connectors/music/lastfm/callback'
const REGISTERED_REDIRECTS = [`https://echo-ai-blue.vercel.app${CALLBACK_PATH}`, `http://localhost:3000${CALLBACK_PATH}`]

export const MUSIC_STATE_AAD = 'lastfm-login-state'
export const MUSIC_NONCE_COOKIE = 'echo_lastfm_login'
export const MUSIC_COOKIE_PATH = '/api/connectors/music'

type LoginState = { uid: string; nonce: string; expiresAt: number }

export class LastfmLoginError extends Error {
  constructor(public kind: 'expired_state' | 'denied' | 'failed') {
    super(`Last.fm login ${kind}`)
    this.name = 'LastfmLoginError'
  }
}

/** The registered callback URL for a request origin, or null when the origin is not registered. */
export function redirectUriFor(origin: string): string | null {
  const uri = `${origin}${CALLBACK_PATH}`
  return REGISTERED_REDIRECTS.includes(uri) ? uri : null
}

const sameNonce = (a: string, b: string) => {
  const h = (x: string) => createHash('sha256').update(x).digest()
  return timingSafeEqual(h(a), h(b))
}

/** Last.fm's authorize URL; its `cb` is the callback URL with the sealed state as a query param (Last.fm adds `token=`). */
export function loginUrl(uid: string, callbackUrl: string, nonce: string): string {
  const state: LoginState = { uid, nonce, expiresAt: Date.now() + STATE_TTL_MS }
  const cb = new URL(callbackUrl)
  cb.searchParams.set('state', seal(state, MUSIC_STATE_AAD))
  return lastfmAuthUrl(cb.toString())
}

/** `nonce` is the login cookie's value; it must match the one sealed in `state`. Returns the Last.fm username. */
export async function finishLogin(token: string, state: string, nonce: string): Promise<{ username: string }> {
  const s = open<LoginState>(state, MUSIC_STATE_AAD)
  if (!s || typeof s.uid !== 'string' || !s.uid) throw new LastfmLoginError('denied')
  if (typeof s.nonce !== 'string' || !s.nonce || !nonce || !sameNonce(s.nonce, nonce)) throw new LastfmLoginError('denied')
  if (!(s.expiresAt > Date.now())) throw new LastfmLoginError('expired_state')
  try {
    return await getSession(token)
  } catch {
    throw new LastfmLoginError('failed')
  }
}
