import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { NextResponse } from 'next/server'
import { buildUserContents, extractCheckInTime, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from '@/lib/echo/prompt'
import { parseEchoRequest, sanitizeEchoResponse } from '@/lib/echo/sanitize'
import type { EchoResponse } from '@/lib/echo/types'
import { geminiModels, withModelFallback } from '@/lib/server/gemini-fallback'
import { isConnected, type ConnectorId, type ConnectorStatus } from '@/lib/echo/connectors'
import { estimateNutrition, looksLikeMeal, resolveMeals, withSpeculative } from '@/lib/server/nutrition'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 30

// Per model attempt; with the default two-model chain the worst case stays under maxDuration.
const GEMINI_ATTEMPT_TIMEOUT_MS = 9000

const FALLBACK: EchoResponse = {
  reply: "I couldn't think that through just now — try again?",
  actions: [],
  memories: [],
  trace: ['Gemini unavailable'],
  error: true,
}

export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = parseEchoRequest(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[echo] GEMINI_API_KEY is not set')
    return NextResponse.json(FALLBACK)
  }

  const ai = new GoogleGenAI({ apiKey })
  const contents = buildUserContents(parsed)
  const t0 = Date.now()
  // Missing connectors context means Nutrition is connected; null skips the USDA database.
  const lookup = parsed.context.connectors && !isConnected(parsed.context.connectors as { id: ConnectorId; status: ConnectorStatus }[], 'nutrition') ? null : undefined
  const caloriesEnabled = parsed.context.items?.caloriesEnabled !== false
  // Likely a meal: start the calorie estimate now, in parallel with classification.
  const speculative = caloriesEnabled && looksLikeMeal(parsed.text) ? estimateNutrition(ai, { description: parsed.text }, { lookup }).catch(() => null) : null
  try {
    const { value: raw, model } = await withModelFallback(geminiModels(process.env.GEMINI_MODEL), GEMINI_ATTEMPT_TIMEOUT_MS, async (model, signal) => {
      const result = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: signal,
        },
      })
      return JSON.parse(result.text ?? '') as unknown
    })
    const sanitized = sanitizeEchoResponse(raw, parsed.clientTime, extractCheckInTime(parsed.context.profile), parsed.context.memoryLabels, {
      items: parsed.context.items,
      recentMessages: parsed.context.recentMessages,
    })
    const t1 = Date.now()
    // Meals: calories are estimated after classification (USDA food database when it matches) and the total leads the reply.
    const mealCount = sanitized.actions.filter((a) => a.type === 'meal_log').length
    const estimate = withSpeculative((description, mealType) => estimateNutrition(ai, { description, mealType }, { lookup }), speculative, mealCount)
    const out = await resolveMeals(sanitized, caloriesEnabled, estimate)
    if (!out.reply) out.reply = 'Got it.'
    if (process.env.NODE_ENV !== 'production') console.info(`[echo] answered by ${model} in ${t1 - t0} ms${out !== sanitized ? `, meals +${Date.now() - t1} ms` : ''}`)
    return NextResponse.json(out)
  } catch (err) {
    // Never log the user's text; only the failure kind.
    const e = err as { status?: number; name?: string }
    console.warn('[echo] Gemini call failed:', e?.status ?? e?.name ?? 'unknown')
    return NextResponse.json(FALLBACK)
  }
}
