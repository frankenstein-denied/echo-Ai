import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import { buildLiveConfig, liveModel, mintLiveToken, parseLiveSessionRequest } from '@/lib/server/live'
import { mapGeminiError } from '@/lib/server/gemini'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 15

const MAX_BODY_BYTES = 64 * 1024
const MINT_TIMEOUT_MS = 10000

// One client per key for the life of the instance (constructing it per request is avoidable work).
let client: { key: string; ai: GoogleGenAI } | null = null
function genai(apiKey: string): GoogleGenAI {
  if (client?.key !== apiKey) client = { key: apiKey, ai: new GoogleGenAI({ apiKey }) }
  return client.ai
}

export async function POST(req: Request) {
  const t0 = Date.now()
  // The size check only reads headers; when it passes, the body is read while the ID token is verified.
  const declared = req.headers.get('content-length')
  const sizeError =
    declared === null
      ? NextResponse.json({ error: 'Content-Length required' }, { status: 411 })
      : !(Number(declared) <= MAX_BODY_BYTES)
        ? NextResponse.json({ error: 'Body too large' }, { status: 413 })
        : null
  const bodyP: Promise<{ ok: true; body: unknown } | { ok: false }> | null = sizeError
    ? null
    : req.json().then(
        (body: unknown) => ({ ok: true as const, body }),
        () => ({ ok: false as const }),
      )

  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sizeError || !bodyP) return sizeError
  const read = await bodyP
  if (!read.ok) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const parsed = parseLiveSessionRequest(read.body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[voice] GEMINI_API_KEY is not set')
    return NextResponse.json({ error: 'failed' }, { status: 502 })
  }

  const model = liveModel()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const verified = Date.now()
    const token = await Promise.race([
      mintLiveToken(genai(apiKey), model, buildLiveConfig(parsed)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })), MINT_TIMEOUT_MS)
      }),
    ])
    // Timing only (never content): auth + body, then the token mint.
    console.info(`[call-timing] session route verify+body ${verified - t0}ms mint ${Date.now() - verified}ms`)
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
