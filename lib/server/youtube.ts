// YouTube Data API v3 search (server only): find one music video for a query. Never log the query or key.
const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search'
const DEFAULT_TIMEOUT_MS = 6000

export type YoutubeHit = { videoId: string; title: string; channel: string }

export class YoutubeError extends Error {
  constructor(public kind: 'quota' | 'failed' | 'timeout') {
    super(`YouTube search ${kind}`)
    this.name = 'YoutubeError'
  }
}

export function missingYoutubeEnv(): string[] {
  return ['YOUTUBE_API_KEY'].filter((k) => !process.env[k])
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function unescapeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

export async function searchSong(query: string, opts: { timeoutMs?: number; fetch?: typeof fetch } = {}): Promise<YoutubeHit | null> {
  const f = opts.fetch ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const q = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoCategoryId: '10',
      maxResults: '1',
      safeSearch: 'moderate',
      q: query,
      key: process.env.YOUTUBE_API_KEY ?? '',
    })
    const res = await f(`${SEARCH_URL}?${q.toString()}`, { signal: ctrl.signal, cache: 'no-store' })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      const reason = (body as { error?: { errors?: { reason?: unknown }[] } } | null)?.error?.errors?.[0]?.reason
      const quota = res.status === 429 || (res.status === 403 && typeof reason === 'string' && /quota|rateLimit/i.test(reason))
      throw new YoutubeError(quota ? 'quota' : 'failed')
    }
    const items = (body as { items?: unknown } | null)?.items
    if (!Array.isArray(items) || items.length === 0) return null
    const item = items[0] as { id?: { videoId?: unknown }; snippet?: { title?: unknown; channelTitle?: unknown } }
    const videoId = item?.id?.videoId
    if (typeof videoId !== 'string' || !videoId) return null
    const title = typeof item.snippet?.title === 'string' ? unescapeEntities(item.snippet.title) : ''
    const channel = typeof item.snippet?.channelTitle === 'string' ? unescapeEntities(item.snippet.channelTitle) : ''
    return { videoId, title, channel }
  } catch (err) {
    if (err instanceof YoutubeError) throw err
    throw new YoutubeError(ctrl.signal.aborted ? 'timeout' : 'failed')
  } finally {
    clearTimeout(timer)
  }
}
