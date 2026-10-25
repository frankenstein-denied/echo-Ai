import { NextResponse } from 'next/server'
import { DEFAULT_VOICE, mapGeminiError, synthesizeSpeech, VOICES } from '@/lib/server/gemini'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BODY_BYTES = 16 * 1024

export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const declared = req.headers.get('content-length')
  if (declared === null) return NextResponse.json({ error: 'Content-Length required' }, { status: 411 })
  if (!(Number(declared) <= MAX_BODY_BYTES)) return NextResponse.json({ error: 'Body too large' }, { status: 413 })

  let body: { text?: unknown; voice?: unknown }
  try {
    const parsed: unknown = await req.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text || text.length > 1000) return NextResponse.json({ error: 'text must be 1-1000 characters' }, { status: 400 })
  const voice = typeof body.voice === 'string' && VOICES.some((v) => v.id === body.voice) ? body.voice : DEFAULT_VOICE

  try {
    const { wav, model } = await synthesizeSpeech(text, voice)
    if (process.env.NODE_ENV !== 'production') console.info(`[voice] spoke with ${model}`)
    return new Response(new Uint8Array(wav), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } })
  } catch (err) {
    // Never log the user's text; only the failure kind.
    const e = err as { status?: number; name?: string }
    console.warn('[voice] speak failed:', e?.status ?? e?.name ?? 'unknown')
    const { status, body: out } = mapGeminiError(err)
    return NextResponse.json(out, { status })
  }
}
