// Last.fm helpers (server only): web-auth URL, signed auth.getSession, and read-only history lookups.
// Never log usernames, tokens or keys.
import { createHash } from 'node:crypto'

const API = 'https://ws.audioscrobbler.com/2.0/'
const DEFAULT_TIMEOUT_MS = 6000

export type LastfmTrack = { title: string; artist: string; nowPlaying: boolean }
export type LastfmArtist = { name: string; plays: number }

export class LastfmError extends Error {
  constructor(public kind: 'not_found' | 'failed' | 'timeout') {
    super(`Last.fm ${kind}`)
    this.name = 'LastfmError'
  }
}

type Opts = { timeoutMs?: number; fetch?: typeof fetch }

export function missingLastfmEnv(): string[] {
  return ['LASTFM_API_KEY', 'LASTFM_API_SECRET'].filter((k) => !process.env[k])
}

export function lastfmAuthUrl(callbackUrl: string): string {
  const q = new URLSearchParams({ api_key: process.env.LASTFM_API_KEY ?? '', cb: callbackUrl })
  return `https://www.last.fm/api/auth/?${q.toString()}`
}

/** Last.fm request signature: params sorted by name, name+value concatenated, secret appended, md5 hex. */
export function apiSig(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .filter((k) => k !== 'format' && k !== 'callback')
    .sort()
    .map((k) => k + params[k])
    .join('')
  return createHash('md5')
    .update(base + secret, 'utf8')
    .digest('hex')
}

async function call(params: Record<string, string>, opts: Opts): Promise<Record<string, unknown>> {
  const f = opts.fetch ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const q = new URLSearchParams({ ...params, api_key: process.env.LASTFM_API_KEY ?? '', format: 'json' })
    const res = await f(`${API}?${q.toString()}`, { signal: ctrl.signal, cache: 'no-store' })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* non-JSON body */
    }
    const errCode = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined
    if (errCode !== undefined) throw new LastfmError(Number(errCode) === 6 ? 'not_found' : 'failed')
    if (!res.ok || !body || typeof body !== 'object') throw new LastfmError('failed')
    return body as Record<string, unknown>
  } catch (err) {
    if (err instanceof LastfmError) throw err
    throw new LastfmError(ctrl.signal.aborted ? 'timeout' : 'failed')
  } finally {
    clearTimeout(timer)
  }
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export async function getSession(token: string, opts: Opts = {}): Promise<{ username: string }> {
  const params: Record<string, string> = { method: 'auth.getSession', token, api_key: process.env.LASTFM_API_KEY ?? '' }
  const api_sig = apiSig(params, process.env.LASTFM_API_SECRET ?? '')
  const body = await call({ method: params.method, token, api_sig }, opts)
  const name = str((body.session as { name?: unknown } | undefined)?.name)
  if (!name) throw new LastfmError('failed')
  return { username: name }
}

export async function recentTracks(username: string, limit: number, opts: Opts = {}): Promise<LastfmTrack[]> {
  const body = await call({ method: 'user.getRecentTracks', user: username, limit: String(limit) }, opts)
  const raw = asArray((body.recenttracks as { track?: unknown } | undefined)?.track)
  const out: LastfmTrack[] = []
  for (const t of raw as { name?: unknown; artist?: { '#text'?: unknown }; '@attr'?: { nowplaying?: unknown } }[]) {
    const title = str(t?.name)
    if (!title) continue
    out.push({ title, artist: str(t.artist?.['#text']), nowPlaying: t['@attr']?.nowplaying === 'true' })
  }
  return out
}

export async function topArtists(username: string, period = '7day', limit = 5, opts: Opts = {}): Promise<LastfmArtist[]> {
  const body = await call({ method: 'user.getTopArtists', user: username, period, limit: String(limit) }, opts)
  const raw = asArray((body.topartists as { artist?: unknown } | undefined)?.artist)
  const out: LastfmArtist[] = []
  for (const a of raw as { name?: unknown; playcount?: unknown }[]) {
    const name = str(a?.name)
    if (name) out.push({ name, plays: Number(a.playcount) || 0 })
  }
  return out
}
