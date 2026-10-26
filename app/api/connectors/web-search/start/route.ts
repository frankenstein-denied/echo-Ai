import { NextResponse } from 'next/server'
import { authorizeUrl, missingTavilyEnv, newNonce, NONCE_COOKIE, redirectUriFor } from '@/lib/server/tavily-oauth'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'

// Starts "Log in with Tavily": responds { url } (Tavily's authorize page with PKCE and a sealed state) and binds
// the login to this browser with an HttpOnly nonce cookie that the callback checks against the state.
export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const origin = new URL(req.url).origin
  const redirectUri = redirectUriFor(origin)
  if (!redirectUri) return NextResponse.json({ error: 'Unregistered origin' }, { status: 400 })

  const missing = missingTavilyEnv()
  if (missing) {
    console.error(`[web-search] ${missing} is not set or invalid`)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  const nonce = newNonce()
  const res = NextResponse.json({ url: authorizeUrl(user.uid, redirectUri, nonce) }, { headers: { 'Cache-Control': 'no-store' } })
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: origin !== 'http://localhost:3000',
    sameSite: 'lax',
    path: '/api/connectors/web-search',
    maxAge: 600,
  })
  return res
}
