import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { NextResponse } from 'next/server'
import { buildVoiceContents, LEGACY_BODY_MAX_BYTES, parseVoiceRequest, sanitizeVoice, VOICE_RESPONSE_SCHEMA, VOICE_SYSTEM_INSTRUCTION } from '@/lib/echo/legacy-prompt'
import { mapGeminiError } from '@/lib/server/gemini'
import { geminiModels, withModelFallback } from '@/lib/server/gemini-fallback'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 30

// Per model attempt; the default two-model chain stays under maxDuration.
const GEMINI_ATTEMPT_TIMEOUT_MS = 13000
const noStore = { headers: { 'Cache-Control': 'no-store' } }

// The owner's voice profile, built from lines the owner typed. Responds with a VoiceProfile; the client saves it.
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
  const parsed = parseVoiceRequest(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[legacy-voice] GEMINI_API_KEY is not set')
    return NextResponse.json({ error: 'failed' }, { status: 502, ...noStore })
  }

  const ai = new GoogleGenAI({ apiKey })
  const contents = buildVoiceContents(parsed)
  const t0 = Date.now()
  try {
    const { value, model } = await withModelFallback(geminiModels(process.env.GEMINI_MODEL), GEMINI_ATTEMPT_TIMEOUT_MS, async (model, signal) => {
      const result = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: VOICE_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: VOICE_RESPONSE_SCHEMA,
          temperature: 0.3,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: signal,
        },
      })
      const voice = sanitizeVoice(JSON.parse(result.text ?? ''))
      // No style summary is unusable; move on to the next model.
      if (!voice.summary) throw new SyntaxError('Voice profile had no summary')
      return voice
    })
    if (process.env.NODE_ENV !== 'production') console.info(`[legacy-voice] built by ${model} in ${Date.now() - t0} ms`)
    return NextResponse.json({ ...value, builtAt: Date.now() }, noStore)
  } catch (err) {
    // Never log the owner's lines; only the failure kind.
    const e = err as { status?: number; name?: string }
    console.warn('[legacy-voice] Gemini call failed:', e?.status ?? e?.name ?? 'unknown')
    const { status, body: out } = mapGeminiError(err)
    return NextResponse.json(out, { status, ...noStore })
  }
}
