import { NextResponse } from 'next/server'
import { AI_PROVIDERS, type AiProvider } from '@/lib/echo/connectors'
import { sealAiKey } from '@/lib/server/ask-model'
import { validSecret } from '@/lib/server/sealed'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
const noStore = { headers: { 'Cache-Control': 'no-store' } }

// { provider, key } -> { sealed }: the user's own AI API key, sealed to them; the browser stores only the sealed copy.
export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, ...noStore })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, ...noStore })
  }
  const { provider, key } = (body && typeof body === 'object' ? body : {}) as { provider?: unknown; key?: unknown }
  const k = typeof key === 'string' ? key.trim() : ''
  if (!(AI_PROVIDERS as readonly unknown[]).includes(provider) || k.length < 10 || k.length > 400 || /\s/.test(k)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400, ...noStore })
  }
  if (!validSecret(process.env.CONNECTOR_SECRET)) return NextResponse.json({ error: 'not_configured' }, { status: 503, ...noStore })
  return NextResponse.json({ sealed: sealAiKey(user.uid, provider as AiProvider, k) }, noStore)
}
