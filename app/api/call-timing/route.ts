import { NextResponse } from 'next/server'
import { formatTimingLine, parseTimingReport, TIMING_LIMITS } from '@/lib/echo/call-timing'
import { verifyUser } from '@/lib/server/verify-user'

export const runtime = 'nodejs'
export const maxDuration = 5

const PER_HOUR = 30
const slots = new Map<string, number[]>()

// Logs one [call-timing] line per call so slow call starts can be read in the Vercel logs.
// Only step names and milliseconds arrive (see lib/echo/call-timing.ts); never log the uid.
export async function POST(req: Request) {
  const user = await verifyUser(req)
  if (!user) return new NextResponse(null, { status: 401 })
  if (!(Number(req.headers.get('content-length')) <= TIMING_LIMITS.bodyBytes)) return new NextResponse(null, { status: 413 })
  const now = Date.now()
  const recent = (slots.get(user.uid) ?? []).filter((t) => now - t < 3_600_000)
  if (recent.length >= PER_HOUR) return new NextResponse(null, { status: 429 })
  slots.set(user.uid, [...recent, now])
  const report = parseTimingReport(await req.json().catch(() => null))
  if (!report) return new NextResponse(null, { status: 400 })
  console.info(formatTimingLine(report))
  return new NextResponse(null, { status: 204 })
}
