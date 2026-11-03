import { NextResponse, type NextRequest } from 'next/server'
import { musicFragment } from '@/lib/echo/music'
import { missingLastfmEnv } from '@/lib/server/lastfm'
import { finishLogin, LastfmLoginError, MUSIC_COOKIE_PATH, MUSIC_NONCE_COOKIE, redirectUriFor } from '@/lib/server/lastfm-login'
import { validSecret } from '@/lib/server/sealed'

export const runtime = 'nodejs'
export const maxDuration = 20

const clearNonce = (res: NextResponse) => {
  res.cookies.set(MUSIC_NONCE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: MUSIC_COOKIE_PATH, maxAge: 0 })
  return res
}

// Last.fm redirects here after login with ?token=. Requires the browser's login cookie to match the nonce in
// `state`, exchanges the token for the username, and sends the browser back to Connectors with the username in the
// URL fragment (never sent to any server). The login cookie is cleared on every outcome.
// Never log the token, state, cookie or username.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  if (!redirectUriFor(url.origin)) return clearNonce(NextResponse.json({ error: 'Unregistered origin' }, { status: 400 }))

  const back = (fragment?: string, outcome?: 'cancelled' | 'expired' | 'failed') => {
    const to = new URL('/', url.origin)
    to.searchParams.set('view', 'Connectors')
    if (outcome) to.searchParams.set('music', outcome)
    if (fragment) to.hash = fragment
    return clearNonce(NextResponse.redirect(to, { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }))
  }

  const token = url.searchParams.get('token')
  const state = url.searchParams.get('state')
  const nonce = req.cookies.get(MUSIC_NONCE_COOKIE)?.value
  if (!token && !state) return back(undefined, 'cancelled')
  if (!token || !state) return back(undefined, 'failed')
  if (!nonce) {
    console.warn('[music] login failed: no login cookie')
    return back(undefined, 'failed')
  }
  const missing = [...missingLastfmEnv(), ...(validSecret(process.env.CONNECTOR_SECRET) ? [] : ['CONNECTOR_SECRET'])]
  if (missing.length) {
    console.error(`[music] not configured, missing: ${missing.join(', ')}`)
    return back(undefined, 'failed')
  }
  try {
    const { username } = await finishLogin(token, state, nonce)
    return back(musicFragment('lastfm', username))
  } catch (err) {
    const kind = err instanceof LastfmLoginError ? err.kind : 'failed'
    console.warn('[music] login failed:', kind)
    return back(undefined, kind === 'expired_state' ? 'expired' : 'failed')
  }
}
