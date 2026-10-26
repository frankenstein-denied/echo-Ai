import { NextResponse } from 'next/server'
import { open } from '@/lib/server/sealed'
import { missingTavilyEnv, revoke, type TavilyTokens } from '@/lib/server/tavily-oauth'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 20

const MAX_BODY_BYTES = 16 * 1024
const MAX_SEALED = 8192

// Disconnect: revokes the user's Tavily refresh token (best effort) and responds 204. The browser then clears
// `sealed` from connectors/web-search.
export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const declared = req.headers.get('content-length')
  if (declared === null) return NextResponse.json({ error: 'Content-Length required' }, { status: 411 })
  if (!(Number(declared) <= MAX_BODY_BYTES)) return NextResponse.json({ error: 'Body too large' }, { status: 413 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const sealed = (body as { sealed?: unknown } | null)?.sealed
  if (typeof sealed !== 'string' || !sealed || sealed.length > MAX_SEALED) return NextResponse.json({ error: 'Invalid sealed' }, { status: 400 })

  const missing = missingTavilyEnv()
  if (missing) {
    console.error(`[web-search] ${missing} is not set or invalid`)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  // A value that doesn't open for this uid has nothing we can revoke.
  const tokens = open<TavilyTokens>(sealed, user.uid)
  if (tokens && typeof tokens.refresh === 'string') await revoke(tokens)
  return new Response(null, { status: 204 })
}
