import { NextResponse, type NextRequest } from 'next/server'
import { seal } from '@/lib/server/sealed'
import { exchangeCode, missingTavilyEnv, NONCE_COOKIE, redirectUriFor, TavilyAuthError } from '@/lib/server/tavily-oauth'

export const runtime = 'nodejs'
export const maxDuration = 20

const clearNonce = (res: NextResponse) => {
  res.cookies.set(NONCE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/api/connectors/web-search', maxAge: 0 })
  return res
}

// Tavily redirects here after login. Requires the browser's login cookie to match the nonce in `state`, exchanges
// the code, seals the tokens for the uid inside `state`, and sends the browser back to Connectors with the sealed
// tokens in the URL fragment (never sent to any server). The login cookie is cleared on every outcome.
// Never log the code, state, cookie, tokens or sealed value.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const redirectUri = redirectUriFor(url.origin)
  if (!redirectUri) return clearNonce(NextResponse.json({ error: 'Unregistered origin' }, { status: 400 }))

  const back = (fragment?: string, outcome?: 'cancelled' | 'expired' | 'failed') => {
    const to = new URL('/', url.origin)
    to.searchParams.set('view', 'Connectors')
    if (outcome) to.searchParams.set('tavily', outcome)
    if (fragment) to.hash = `web-search=${fragment}`
    return clearNonce(NextResponse.redirect(to, { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }))
  }

  const error = url.searchParams.get('error')
  if (error) return back(undefined, error === 'access_denied' ? 'cancelled' : 'failed')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const nonce = req.cookies.get(NONCE_COOKIE)?.value
  if (!code || !state) return back(undefined, 'failed')
  if (!nonce) {
    console.warn('[web-search] login failed: no login cookie')
    return back(undefined, 'failed')
  }

  const missing = missingTavilyEnv()
  if (missing) {
    console.error(`[web-search] ${missing} is not set or invalid`)
    return back(undefined, 'failed')
  }
  try {
    const { uid, tokens } = await exchangeCode(code, state, redirectUri, nonce)
    return back(seal(tokens, uid))
  } catch (err) {
    const kind = err instanceof TavilyAuthError ? err.kind : 'failed'
    console.warn('[web-search] login failed:', kind)
    return back(undefined, kind === 'expired_state' ? 'expired' : 'failed')
  }
}
