import { NextResponse } from 'next/server'
import { mapGeminiError, transcribeWav } from '@/lib/server/gemini'
import { readWavInfo } from '@/lib/server/wav'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BYTES = 10 * 1024 * 1024
const MAX_SECONDS = 60
const MULTIPART_MARGIN = 64 * 1024

export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reject by declared size before buffering the body.
  const declared = req.headers.get('content-length')
  if (declared === null) return NextResponse.json({ error: 'Content-Length required' }, { status: 411 })
  if (!(Number(declared) <= MAX_BYTES + MULTIPART_MARGIN)) return NextResponse.json({ error: 'Audio too large' }, { status: 413 })

  let file: FormDataEntryValue | null
  try {
    file = (await req.formData()).get('audio')
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Missing audio' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Audio too large' }, { status: 413 })

  const wav = Buffer.from(await file.arrayBuffer())
  const info = readWavInfo(wav)
  if (!info) return NextResponse.json({ error: 'Audio must be a WAV file' }, { status: 415 })
  if (info.durationSec > MAX_SECONDS) return NextResponse.json({ error: 'Audio too long' }, { status: 413 })

  try {
    const { text, model } = await transcribeWav(wav)
    if (process.env.NODE_ENV !== 'production') console.info(`[voice] transcribed with ${model}`)
    return NextResponse.json({ text })
  } catch (err) {
    const e = err as { status?: number; name?: string }
    console.warn('[voice] transcribe failed:', e?.status ?? e?.name ?? 'unknown')
    const { status, body } = mapGeminiError(err)
    return NextResponse.json(body, { status })
  }
}
