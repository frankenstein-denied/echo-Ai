// Browser-safe music helpers: YouTube embed/app URLs, link parsing and video titles (oEmbed). No secrets.

/** With `origin` (the page's), the embed accepts postMessage listeners and reports its state, e.g. when a song ends. */
export const youtubeEmbedUrl = (id: string, autoplay: boolean, origin?: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=${autoplay ? 1 : 0}${origin ? `&enablejsapi=1&origin=${encodeURIComponent(origin)}` : ''}`

export const youtubeMusicUrl = (id: string) => `https://music.youtube.com/watch?v=${encodeURIComponent(id)}`

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])
const SCHEMELESS_RE = /^(?:(?:www\.|m\.|music\.)?youtube\.com|youtu\.be)\//i

/** The 11-character video ID of the first YouTube / YouTube Music link in `text` (watch, youtu.be, shorts, embed), or null. */
export function parseYoutubeLink(text: string): string | null {
  if (typeof text !== 'string') return null
  for (const raw of text.slice(0, 4000).split(/\s+/)) {
    // Strip wrapping punctuation from a pasted or quoted link: (<"link">), "link." etc.
    const token = raw.replace(/^[<(["'“‘]+/, '').replace(/[>)\]"'”’.,!?;:]+$/, '')
    if (!token) continue
    const candidate = /^https?:\/\//i.test(token) ? token : SCHEMELESS_RE.test(token) ? `https://${token}` : null
    if (!candidate) continue
    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      continue
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) continue
    const host = url.hostname.toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)
    let id: string | null = null
    if (host === 'youtu.be') id = parts.length === 1 ? parts[0] : null
    else if (YT_HOSTS.has(host)) {
      if (parts.length === 1 && parts[0] === 'watch') id = url.searchParams.get('v')
      else if (parts.length === 2 && (parts[0] === 'shorts' || parts[0] === 'embed')) id = parts[1]
    }
    if (id && YT_ID_RE.test(id)) return id
  }
  return null
}

/**
 * Title and channel of a YouTube video from YouTube's oEmbed endpoint (no API key; it allows browser requests).
 * Falls back to a plain "YouTube video" title. Never throws.
 */
export async function fetchVideoInfo(videoId: string, fetchImpl: typeof fetch = fetch): Promise<{ videoId: string; title: string; channel?: string }> {
  const plain = { videoId, title: 'YouTube video' }
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return plain
    const d = (await res.json()) as { title?: unknown; author_name?: unknown }
    const title = typeof d.title === 'string' ? d.title.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    const channel = typeof d.author_name === 'string' ? d.author_name.trim().slice(0, 200) : ''
    return title ? { videoId, title, ...(channel ? { channel } : {}) } : plain
  } catch {
    return plain
  }
}
