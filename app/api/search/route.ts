import { NextResponse } from 'next/server'
import { tavilySearch, TavilyError } from '@/lib/server/tavily'
import { missingTavilyEnv, TavilyAuthError, withFreshTokens } from '@/lib/server/tavily-oauth'
import { verifyUser } from '@/lib/server/verify-user'
import { SEARCH_LIMITS, takeSearchSlot } from '@/lib/server/web-answer'

export const runtime = 'nodejs'
export const maxDuration = 20

const MAX_BODY_BYTES = 16 * 1024
const MAX_SEALED = 8192
const MAX_QUERY = 300
const TIMEOUT_MS = 8000

// Web search for Echo calls. { query, sealed } -> { results: { title, url, content }[], resealed? } or
// { error: 'not_connected' | 'reconnect' | 'quota' | 'rate_limited' | 'failed', resealed? }. Shares the per-user
// hourly limit with typed chat. Never log the query, the results or the sealed tokens.
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
  const { query: rawQuery, sealed } = (body && typeof body === 'object' ? body : {}) as { query?: unknown; sealed?: unknown }
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : ''
  if (!query || query.length > MAX_QUERY) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  if (sealed !== undefined && (typeof sealed !== 'string' || sealed.length > MAX_SEALED)) return NextResponse.json({ error: 'Invalid sealed' }, { status: 400 })

  const noStore = { headers: { 'Cache-Control': 'no-store' } }
  const missing = missingTavilyEnv()
  if (missing) console.error(`[search] ${missing} is not set or invalid`)
  if (missing || !sealed) return NextResponse.json({ error: 'not_connected' }, noStore)
  if (!takeSearchSlot(user.uid)) return NextResponse.json({ error: 'rate_limited' }, { status: 429, ...noStore })

  let resealed: string | undefined
  try {
    const fresh = await withFreshTokens(sealed, user.uid)
    resealed = fresh.resealed
    const results = await tavilySearch(fresh.tokens.access, query, { timeoutMs: TIMEOUT_MS })
    return NextResponse.json({ results: results.slice(0, SEARCH_LIMITS.sources), ...(resealed ? { resealed } : {}) }, noStore)
  } catch (err) {
    const keep = resealed ? { resealed } : {}
    // A refused refresh (Tavily's refresh fails today) or a rejected token: the login is gone.
    if (err instanceof TavilyAuthError || (err instanceof TavilyError && err.kind === 'auth')) return NextResponse.json({ error: 'reconnect' }, noStore)
    if (err instanceof TavilyError && err.kind === 'quota') return NextResponse.json({ error: 'quota', ...keep }, { status: 429, ...noStore })
    console.warn('[search] failed:', err instanceof TavilyError ? err.kind : ((err as { name?: string })?.name ?? 'unknown'))
    return NextResponse.json({ error: 'failed', ...keep }, { status: 502, ...noStore })
  }
}
