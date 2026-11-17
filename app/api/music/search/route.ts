import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/server/verify-user'
import { takeMusicSlot } from '@/lib/server/web-answer'
import { missingYoutubeEnv, searchSong, YoutubeError } from '@/lib/server/youtube'

export const runtime = 'nodejs'
export const maxDuration = 15

const MAX_BODY_BYTES = 4 * 1024
const MAX_QUERY = 200
const TIMEOUT_MS = 6000

// Song search for the music player. { query } -> { videoId, title, channel } or
// { error: 'not_found' | 'not_configured' | 'quota' | 'rate_limited' | 'failed' }. Pasted YouTube links never come here
// (the browser plays them directly). Never log the query, the result or the key.
const noStore = { headers: { 'Cache-Control': 'no-store' } }

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
  const rawQuery = body && typeof body === 'object' ? (body as { query?: unknown }).query : undefined
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : ''
  if (!query || query.length > MAX_QUERY) return NextResponse.json({ error: 'Invalid query' }, { status: 400, ...noStore })

  const missing = missingYoutubeEnv()
  if (missing.length) {
    console.error(`[music] ${missing.join(', ')} is not set`)
    return NextResponse.json({ error: 'not_configured' }, noStore)
  }
  if (!takeMusicSlot(user.uid)) return NextResponse.json({ error: 'rate_limited' }, { status: 429, ...noStore })

  try {
    const hit = await searchSong(query, { timeoutMs: TIMEOUT_MS })
    if (!hit) return NextResponse.json({ error: 'not_found' }, noStore)
    return NextResponse.json({ videoId: hit.videoId, title: hit.title, channel: hit.channel }, noStore)
  } catch (err) {
    if (err instanceof YoutubeError && err.kind === 'quota') {
      console.warn('[music] search failed: quota')
      return NextResponse.json({ error: 'quota' }, { status: 429, ...noStore })
    }
    const kind = err instanceof YoutubeError ? err.kind : ((err as { name?: string })?.name ?? 'unknown')
    console.warn('[music] search failed:', kind)
    return NextResponse.json({ error: 'failed' }, { status: kind === 'timeout' ? 504 : 502, ...noStore })
  }
}
