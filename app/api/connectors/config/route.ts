import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Which connectors the server can actually run (their API keys are set). Booleans only, never the keys.
export async function GET() {
  return NextResponse.json(
    { news: !!process.env.GNEWS_API_KEY?.trim(), movies: !!process.env.TMDB_API_KEY?.trim(), youtube: !!process.env.YOUTUBE_API_KEY?.trim() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
