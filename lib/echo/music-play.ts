// Browser-safe: find a song for the music player. A pasted YouTube / YouTube Music link plays directly (no API key, no
// request); a song name goes through POST /api/music/search. Fixed replies per error; never logs the query.
import { parseYoutubeLink } from './music'
import { fetchWithTimeout } from './send-helpers'
import type { EchoResponse } from './types'

export type MusicTrack = { videoId: string; title: string; channel?: string }
export type MusicError = 'not_found' | 'not_configured' | 'quota' | 'rate_limited' | 'failed'
export type FindOutcome = { ok: true; track: MusicTrack } | { ok: false; error: MusicError; reply: string }

/** Shown for a pasted link (the embedded player shows the real title; no extra API call). */
export const LINK_TITLE = 'YouTube video'
const TITLE_MAX = 200

export const MUSIC_REPLIES: Record<MusicError, string> = {
  not_found: "I couldn't find that song.",
  not_configured: "Searching by song name isn't set up yet — paste a YouTube or YouTube Music link and I'll play it.",
  quota: "YouTube searches are used up for today. Paste a YouTube or YouTube Music link and I'll play it.",
  rate_limited: "I've looked up a lot of songs this hour. Try again later, or paste a YouTube link.",
  failed: "I couldn't reach YouTube just now. Try again in a moment.",
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/
const fail = (error: MusicError): FindOutcome => ({ ok: false, error, reply: MUSIC_REPLIES[error] })

/** Finds the track for a play_music query (or a link in the user's own message). Never throws. */
export async function findTrack(user: { getIdToken: () => Promise<string> }, query: string, opts: { text?: string; fetchImpl?: typeof fetch } = {}): Promise<FindOutcome> {
  const linked = parseYoutubeLink(query) ?? (opts.text ? parseYoutubeLink(opts.text) : null)
  if (linked) return { ok: true, track: { videoId: linked, title: LINK_TITLE } }
  try {
    const token = await user.getIdToken()
    const res = await fetchWithTimeout(
      '/api/music/search',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query: query.slice(0, 200) }) },
      12000,
      opts.fetchImpl,
    )
    const d = (await res.json().catch(() => ({}))) as { videoId?: unknown; title?: unknown; channel?: unknown; error?: unknown }
    if (typeof d.error === 'string') return fail(d.error in MUSIC_REPLIES ? (d.error as MusicError) : 'failed')
    if (!res.ok || typeof d.videoId !== 'string' || !ID_RE.test(d.videoId)) return fail('failed')
    const title = typeof d.title === 'string' && d.title.trim() ? d.title.trim().slice(0, TITLE_MAX) : LINK_TITLE
    const channel = typeof d.channel === 'string' && d.channel.trim() ? d.channel.trim().slice(0, TITLE_MAX) : undefined
    return { ok: true, track: { videoId: d.videoId, title, ...(channel ? { channel } : {}) } }
  } catch {
    return fail('failed')
  }
}

/** Typed chat: resolves a play_music action. On failure Echo's reply becomes the fixed error text (nothing opens). */
export async function resolvePlayMusic(res: EchoResponse, find: (query: string) => Promise<FindOutcome>): Promise<{ res: EchoResponse; track?: MusicTrack }> {
  const action = res.actions.find((a) => a.type === 'play_music')
  if (!action) return { res }
  let out: FindOutcome
  try {
    out = await find(action.query)
  } catch {
    out = fail('failed')
  }
  if (!out.ok) return { res: { ...res, reply: out.reply } }
  return { res: res.reply.trim() ? res : { ...res, reply: `Playing ${out.track.title}.` }, track: out.track }
}

/** Calls: the play_music tool result (the player opened paused). */
export function musicToolOutput(out: FindOutcome): Record<string, unknown> {
  return out.ok ? { ok: true, title: out.track.title } : { error: out.error, tell_user: out.reply }
}
