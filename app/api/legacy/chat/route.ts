import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { NextResponse } from 'next/server'
import {
  buildMemorialContents,
  FALLBACK_BUBBLE,
  LEGACY_BODY_MAX_BYTES,
  MEMORIAL_RESPONSE_SCHEMA,
  MEMORIAL_SYSTEM_INSTRUCTION,
  parseMemorialRequest,
  sanitizeBubbles,
} from '@/lib/echo/legacy-prompt'
import { mapGeminiError } from '@/lib/server/gemini'
import { geminiModels, withModelFallback } from '@/lib/server/gemini-fallback'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 30

// Per model attempt; the default two-model chain stays under maxDuration.
const GEMINI_ATTEMPT_TIMEOUT_MS = 13000
const noStore = { headers: { 'Cache-Control': 'no-store' } }

// The memorial chat: answers as the owner, from what the owner shared. Responds { bubbles: string[] } (1-4).
// Read access is enforced by firestore.rules on the client's reads; this route only sees what the client sends.
export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const declared = req.headers.get('content-length')
  if (declared !== null && !(Number(declared) <= LEGACY_BODY_MAX_BYTES)) return NextResponse.json({ error: 'Body too large' }, { status: 413 })

  let body: unknown
  try {
    const text = await req.text()
    if (new TextEncoder().encode(text).length > LEGACY_BODY_MAX_BYTES) return NextResponse.json({ error: 'Body too large' }, { status: 413 })
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = parseMemorialRequest(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[legacy-chat] GEMINI_API_KEY is not set')
    return NextResponse.json({ error: 'failed' }, { status: 502, ...noStore })
  }

  const ai = new GoogleGenAI({ apiKey })
  const contents = buildMemorialContents(parsed)
  const systemInstruction = MEMORIAL_SYSTEM_INSTRUCTION(parsed.ownerName)
  const t0 = Date.now()
  try {
    const { value, model } = await withModelFallback(geminiModels(process.env.GEMINI_MODEL), GEMINI_ATTEMPT_TIMEOUT_MS, async (model, signal) => {
      const result = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: MEMORIAL_RESPONSE_SCHEMA,
          temperature: 0.8,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: signal,
        },
      })
      const bubbles = sanitizeBubbles(result.text ?? '')
      // Malformed or empty output moves on to the next model; the client shows FALLBACK_BUBBLE if all fail.
      if (bubbles.length === 1 && bubbles[0] === FALLBACK_BUBBLE) throw new SyntaxError('Memorial reply had no bubbles')
      return bubbles
    })
    if (process.env.NODE_ENV !== 'production') console.info(`[legacy-chat] answered by ${model} in ${Date.now() - t0} ms`)
    return NextResponse.json({ bubbles: value }, noStore)
  } catch (err) {
    // Never log the chat or the memories; only the failure kind.
    const e = err as { status?: number; name?: string }
    console.warn('[legacy-chat] Gemini call failed:', e?.status ?? e?.name ?? 'unknown')
    const { status, body: out } = mapGeminiError(err)
    return NextResponse.json(out, { status, ...noStore })
  }
}
