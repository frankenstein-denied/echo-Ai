import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import { buildLiveConfig, liveModel, mintLiveToken, parseLiveSessionRequest } from '@/lib/server/live'
import { mapGeminiError } from '@/lib/server/gemini'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 15

const MAX_BODY_BYTES = 64 * 1024
const MINT_TIMEOUT_MS = 10000

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
  const parsed = parseLiveSessionRequest(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[voice] GEMINI_API_KEY is not set')
    return NextResponse.json({ error: 'failed' }, { status: 502 })
  }

  const model = liveModel()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const ai = new GoogleGenAI({ apiKey })
    const token = await Promise.race([
      mintLiveToken(ai, model, buildLiveConfig(parsed)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })), MINT_TIMEOUT_MS)
      }),
    ])
    return NextResponse.json({ token, model, voice: parsed.voice }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    // Never log the key, the token or the user's context; only the failure kind.
    const e = err as { status?: number; name?: string }
    console.warn('[voice] live session failed:', e?.status ?? e?.name ?? 'unknown')
    const { status, body: out } = mapGeminiError(err)
    return NextResponse.json(out, { status })
  } finally {
    clearTimeout(timer)
  }
}
