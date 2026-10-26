import { NextResponse } from 'next/server'
import { authorizeUrl, missingTavilyEnv, redirectUriFor } from '@/lib/server/tavily-oauth'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'

// Starts "Log in with Tavily": responds { url } (Tavily's authorize page with PKCE and a sealed state).
export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const redirectUri = redirectUriFor(new URL(req.url).origin)
  if (!redirectUri) return NextResponse.json({ error: 'Unregistered origin' }, { status: 400 })

  const missing = missingTavilyEnv()
  if (missing) {
    console.error(`[web-search] ${missing} is not set`)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  return NextResponse.json({ url: authorizeUrl(user.uid, redirectUri) }, { headers: { 'Cache-Control': 'no-store' } })
}
