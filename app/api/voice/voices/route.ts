import { NextResponse } from 'next/server'
import { DEFAULT_VOICE, VOICES } from '@/lib/server/gemini'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: Request) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ voices: VOICES, default: DEFAULT_VOICE })
}
