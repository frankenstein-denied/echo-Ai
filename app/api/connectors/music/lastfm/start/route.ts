import { NextResponse } from 'next/server'
import { missingLastfmEnv } from '@/lib/server/lastfm'
import { loginUrl, MUSIC_COOKIE_PATH, MUSIC_NONCE_COOKIE, redirectUriFor } from '@/lib/server/lastfm-login'
import { validSecret } from '@/lib/server/sealed'
import { newNonce } from '@/lib/server/tavily-oauth'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'

// Starts "Log in with Last.fm": responds { url } (Last.fm's auth page, cb = our callback carrying a sealed state)
// and binds the login to this browser with an HttpOnly nonce cookie that the callback checks against the state.
export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const origin = new URL(req.url).origin
  const redirectUri = redirectUriFor(origin)
  if (!redirectUri) return NextResponse.json({ error: 'Unregistered origin' }, { status: 400 })

  const missing = [...missingLastfmEnv(), ...(validSecret(process.env.CONNECTOR_SECRET) ? [] : ['CONNECTOR_SECRET'])]
  if (missing.length) {
    console.error(`[music] not configured, missing: ${missing.join(', ')}`)
    return NextResponse.json({ error: 'not_configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const nonce = newNonce()
  const res = NextResponse.json({ url: loginUrl(user.uid, redirectUri, nonce) }, { headers: { 'Cache-Control': 'no-store' } })
  res.cookies.set(MUSIC_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: origin !== 'http://localhost:3000',
    sameSite: 'lax',
    path: MUSIC_COOKIE_PATH,
    maxAge: 600,
  })
  return res
}
