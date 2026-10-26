import { NextResponse } from 'next/server'
import { seal } from '@/lib/server/sealed'
import { exchangeCode, missingTavilyEnv, redirectUriFor, TavilyAuthError } from '@/lib/server/tavily-oauth'

export const runtime = 'nodejs'
export const maxDuration = 20

// Tavily redirects here after login. Exchanges the code, seals the tokens for the uid inside `state`, and sends
// the browser back to Connectors with the sealed tokens in the URL fragment (never sent to any server).
// Never log the code, state, tokens or sealed value.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const redirectUri = redirectUriFor(url.origin)
  if (!redirectUri) return NextResponse.json({ error: 'Unregistered origin' }, { status: 400 })

  const back = (fragment?: string, outcome?: 'cancelled' | 'expired' | 'failed') => {
    const to = new URL('/', url.origin)
    to.searchParams.set('view', 'Connectors')
    if (outcome) to.searchParams.set('tavily', outcome)
    if (fragment) to.hash = `web-search=${fragment}`
    return NextResponse.redirect(to, { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  }

  const error = url.searchParams.get('error')
  if (error) return back(undefined, error === 'access_denied' ? 'cancelled' : 'failed')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return back(undefined, 'failed')

  const missing = missingTavilyEnv()
  if (missing) {
    console.error(`[web-search] ${missing} is not set`)
    return back(undefined, 'failed')
  }
  try {
    const { uid, tokens } = await exchangeCode(code, state, redirectUri)
    return back(seal(tokens, uid))
  } catch (err) {
    const kind = err instanceof TavilyAuthError ? err.kind : 'failed'
    console.warn('[web-search] login failed:', kind)
    return back(undefined, kind === 'expired_state' ? 'expired' : 'failed')
  }
}
