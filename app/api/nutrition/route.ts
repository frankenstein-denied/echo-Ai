import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import { estimateNutrition, NutritionError, parseNutritionRequest } from '@/lib/server/nutrition'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 20

const MAX_BODY_BYTES = 4 * 1024

// Calorie estimate for a described meal (used by the call's log_meal tool; typed chat resolves meals inside
// /api/echo). Responds { items, totalCalories, estimated: true, grounded, assumptions? }.
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
  const parsed = parseNutritionRequest(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[nutrition] GEMINI_API_KEY is not set')
    return NextResponse.json({ error: 'failed' }, { status: 502 })
  }
  try {
    const out = await estimateNutrition(new GoogleGenAI({ apiKey }), parsed)
    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    // Never log the food description; only the failure kind.
    const quota = err instanceof NutritionError && err.kind === 'quota'
    console.warn('[nutrition] estimate failed:', quota ? 'quota' : 'failed')
    return quota
      ? NextResponse.json({ error: 'quota', message: 'Calorie estimates reached the free limit for now. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': '60' } })
      : NextResponse.json({ error: 'failed', message: "Couldn't estimate calories right now." }, { status: 502 })
  }
}
