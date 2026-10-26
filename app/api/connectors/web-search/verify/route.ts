import { NextResponse } from 'next/server'
import { missingTavilyEnv, opensAsTokens } from '@/lib/server/tavily-oauth'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 16 * 1024
const MAX_SEALED = 8192

// Before the browser saves a login handed back in #web-search=<sealed>: 204 when it opens as Tavily tokens for the
// signed-in uid, else 400. Never log the sealed value.
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
  return opensAsTokens(sealed, user.uid) ? new Response(null, { status: 204 }) : NextResponse.json({ error: 'Invalid sealed' }, { status: 400 })
}
