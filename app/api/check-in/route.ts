import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { NextResponse } from 'next/server'
import {
  buildCheckInUserText,
  CHECK_IN_RESPONSE_SCHEMA,
  CHECK_IN_SYSTEM_INSTRUCTION,
  parseCheckInRequest,
  sanitizeCheckInText,
} from '@/lib/echo/check-in-prompt'
import { mapGeminiError } from '@/lib/server/gemini'
import { geminiModels, withModelFallback } from '@/lib/server/gemini-fallback'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 20

// Per model attempt; the default two-model chain stays well under maxDuration. The phone prefetches
// minutes ahead and falls back to its own templates, so a slow answer only costs the AI wording.
const GEMINI_ATTEMPT_TIMEOUT_MS = 7000
const MAX_BODY_BYTES = 24 * 1024
const noStore = { headers: { 'Cache-Control': 'no-store' } }

// The Android bubble's check-in, written from a compact snapshot of the user's day. Responds { shortText, fullText }.
// Any failure answers with an error status, and the phone uses its fixed templates instead.
export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const declared = req.headers.get('content-length')
  if (declared !== null && !(Number(declared) <= MAX_BODY_BYTES)) return NextResponse.json({ error: 'Body too large' }, { status: 413 })

  let body: unknown
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Body too large' }, { status: 413 })
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = parseCheckInRequest(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[check-in] GEMINI_API_KEY is not set')
    return NextResponse.json({ error: 'failed' }, { status: 502 })
  }

  const ai = new GoogleGenAI({ apiKey })
  const contents = buildCheckInUserText(parsed)
  const t0 = Date.now()
  try {
    const { value, model } = await withModelFallback(geminiModels(process.env.GEMINI_MODEL), GEMINI_ATTEMPT_TIMEOUT_MS, async (model, signal) => {
      const result = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: CHECK_IN_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: CHECK_IN_RESPONSE_SCHEMA,
          temperature: 0.9,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: signal,
        },
      })
      const text = sanitizeCheckInText(JSON.parse(result.text ?? ''), parsed)
      // Unusable output (empty, or asking how a reminder still to come went) moves on to the next model.
      if (!text) throw new SyntaxError('Check-in had no text')
      return text
    })
    if (process.env.NODE_ENV !== 'production') console.info(`[check-in] written by ${model} in ${Date.now() - t0} ms`)
    return NextResponse.json(value, noStore)
  } catch (err) {
    // Never log the user's data; only the failure kind.
    const e = err as { status?: number; name?: string }
    console.warn('[check-in] Gemini call failed:', e?.status ?? e?.name ?? 'unknown')
    const { status, body: out } = mapGeminiError(err)
    return NextResponse.json(out, { status, ...noStore })
  }
}
