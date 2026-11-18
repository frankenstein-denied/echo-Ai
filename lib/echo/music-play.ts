// Browser-safe: find a song for the music player. A pasted YouTube / YouTube Music link plays directly (no API key, no
// request); a song name goes through POST /api/music/search. Fixed replies per error; never logs the query.
import { parseYoutubeLink } from './music'
import { matchPlaylist, type Playlist } from './playlists'
import { fetchWithTimeout } from './send-helpers'
import type { EchoResponse, MusicCommand } from './types'

export type MusicTrack = { videoId: string; title: string; channel?: string }
export type MusicError = 'not_found' | 'not_configured' | 'quota' | 'rate_limited' | 'failed' | 'unavailable'
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
  unavailable: "I can't play music in the bubble. Open Echo and ask me there.",
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/
const fail = (error: MusicError): FindOutcome => ({ ok: false, error, reply: MUSIC_REPLIES[error] })

/** The query points at a link instead of naming a song ("that video", "this", a cut-off "youtu.be/"). */
function refersToLink(query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || q.includes('youtu') || /^(this|that|it|the)( (video|song|link|track|one))?$/.test(q)
}

/** Finds the track for a play_music query (or a link in the user's own message). Never throws. */
export async function findTrack(user: { getIdToken: () => Promise<string> }, query: string, opts: { text?: string; fetchImpl?: typeof fetch } = {}): Promise<FindOutcome> {
  const linked = parseYoutubeLink(query) ?? (opts.text && refersToLink(query) ? parseYoutubeLink(opts.text) : null)
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

/**
 * Typed chat: resolves a play_music action. Alone, a failure makes Echo's reply the fixed error text (nothing opens).
 * With saves too, a failure drops the router's reply (it may claim music is playing): the reply becomes the save
 * confirmation built after applying (fallbackReply) followed by `replySuffix`, the error text.
 */
export async function resolvePlayMusic(res: EchoResponse, find: (query: string) => Promise<FindOutcome>): Promise<{ res: EchoResponse; track?: MusicTrack; replySuffix?: string }> {
  const action = res.actions.find((a) => a.type === 'play_music')
  if (!action) return { res }
  const withSaves = res.actions.some((a) => a.type !== 'play_music' && a.type !== 'general')
  let out: FindOutcome
  try {
    out = await find(action.query)
  } catch {
    out = fail('failed')
  }
  if (!out.ok) return withSaves ? { res: { ...res, reply: '' }, replySuffix: out.reply } : { res: { ...res, reply: out.reply } }
  if (res.reply.trim()) return { res, track: out.track }
  const playing = `Playing ${out.track.title}.`
  return withSaves ? { res, track: out.track, replySuffix: playing } : { res: { ...res, reply: playing }, track: out.track }
}

/** Calls: the play_music tool result (the player opened paused). */
export function musicToolOutput(out: FindOutcome): Record<string, unknown> {
  return out.ok ? { ok: true, title: out.track.title } : { error: out.error, tell_user: out.reply }
}

/**
 * A play request: a saved playlist whose name matches ("my gym playlist") plays the whole list; anything else is a
 * song search (findTrack). `queue` is what the player should play ([] on failure). Never throws.
 */
export async function findMusic(
  query: string,
  deps: { playlists: () => Promise<Playlist[]>; find: (query: string) => Promise<FindOutcome>; playlistTimeoutMs?: number },
): Promise<{ outcome: FindOutcome; queue: MusicTrack[] }> {
  let lists: Playlist[] = []
  // A pasted link never names a playlist: don't wait on the read.
  if (!parseYoutubeLink(query)) {
    try {
      // A slow or offline read shouldn't hold up the song (or a call's reply).
      lists = await Promise.race([deps.playlists(), new Promise<Playlist[]>((resolve) => setTimeout(() => resolve([]), deps.playlistTimeoutMs ?? 1500))])
    } catch {
      // Offline or not signed in: just search.
    }
  }
  const pl = matchPlaylist(query, lists)
  if (pl) return { outcome: { ok: true, track: { videoId: pl.tracks[0].videoId, title: `${pl.name} playlist` } }, queue: pl.tracks }
  let outcome: FindOutcome
  try {
    outcome = await deps.find(query)
  } catch {
    outcome = fail('failed')
  }
  return { outcome, queue: outcome.ok ? [outcome.track] : [] }
}

// ---------- player commands ----------

/** What a player command did: ok, or why it couldn't. */
export type ControlResult = 'ok' | 'nothing_playing' | 'no_next' | 'no_previous' | 'no_shuffle' | 'in_call' | 'unavailable'

export const MUSIC_CONTROL_REPLIES: Record<Exclude<ControlResult, 'ok' | 'unavailable'>, string> = {
  nothing_playing: "Nothing is playing right now. Ask me to play a song or one of your playlists.",
  no_next: "That's the last song in the queue.",
  no_previous: "That's the first song in the queue.",
  no_shuffle: "There's nothing left in the queue to shuffle.",
  in_call: "It's ready in the player — tap play when you want it. I won't play music over our call.",
}

const controlReply = (r: Exclude<ControlResult, 'ok'>) => (r === 'unavailable' ? MUSIC_REPLIES.unavailable : MUSIC_CONTROL_REPLIES[r])

/** Typed chat: runs a music_control action on the player; when it can't, the reply says why instead. */
export function resolveMusicControl(res: EchoResponse, control: (command: MusicCommand) => ControlResult): { res: EchoResponse; result: ControlResult | null } {
  const action = res.actions.find((a) => a.type === 'music_control')
  if (!action) return { res, result: null }
  const result = control(action.command)
  return { res: result === 'ok' ? res : { ...res, reply: controlReply(result) }, result }
}

/** Calls: the music_control tool result. */
export function controlToolOutput(r: ControlResult): Record<string, unknown> {
  return r === 'ok' ? { ok: true } : { error: r, tell_user: controlReply(r) }
}
