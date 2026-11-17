import { NextResponse } from 'next/server'
import { LOOKUP_SOURCES, type LookupSource } from '@/lib/echo/connectors'
import { takeLookupSlot } from '@/lib/server/lookup'
import { fetchLookup, LookupError } from '@/lib/server/lookup-sources'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 15

const MAX_BODY_BYTES = 4 * 1024
const MAX_QUERY = 200
const TIMEOUT_MS = 8000
const noStore = { headers: { 'Cache-Control': 'no-store' } }

// Free connector lookups for Echo calls. { source, query } -> { results: { title, url, content }[] } or
// { error: 'unavailable' } (Echo then searches the web). Shares the hourly limit with typed chat.
// Never log the query, the results or API keys.
export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, ...noStore })

  const declared = req.headers.get('content-length')
  if (declared === null) return NextResponse.json({ error: 'Content-Length required' }, { status: 411, ...noStore })
  if (!(Number(declared) <= MAX_BODY_BYTES)) return NextResponse.json({ error: 'Body too large' }, { status: 413, ...noStore })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, ...noStore })
  }
  const { source, query: rawQuery } = (body && typeof body === 'object' ? body : {}) as { source?: unknown; query?: unknown }
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : ''
  if (!(LOOKUP_SOURCES as readonly unknown[]).includes(source) || !query || query.length > MAX_QUERY) return NextResponse.json({ error: 'Invalid request' }, { status: 400, ...noStore })

  if (!takeLookupSlot(user.uid)) return NextResponse.json({ error: 'unavailable' }, { status: 429, ...noStore })
  try {
    const results = await fetchLookup(source as LookupSource, query, { timeoutMs: TIMEOUT_MS })
    return NextResponse.json({ results }, noStore)
  } catch (err) {
    const kind = err instanceof LookupError ? err.kind : ((err as { name?: string })?.name ?? 'unknown')
    if (kind === 'not_configured') console.error(`[lookup] ${String(source)} is not configured (missing API key)`)
    else console.warn(`[lookup] ${String(source)} failed:`, kind)
    return NextResponse.json({ error: 'unavailable' }, noStore)
  }
}
