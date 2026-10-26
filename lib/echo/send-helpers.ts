import type { EchoCategory } from '@/lib/firestore'
import type { EchoResponse } from './types'

export type SavedLike = { type: EchoCategory | 'memory'; label: string }

// Category of the assistant message: first saved real action; badge-only connector next; memory never; else general.
export function deriveCategory(saved: SavedLike[]): EchoCategory {
  const real = saved.find((s) => s.type !== 'memory' && s.type !== 'connector')
  if (real) return real.type as EchoCategory
  if (saved.some((s) => s.type === 'connector')) return 'connector'
  return 'general'
}

// On retry the user's message is already in history; drop it so it is not sent twice.
export function dropTrailingUser<T extends { role: string; text: string }>(history: T[], text: string): T[] {
  const last = history[history.length - 1]
  if (last && last.role === 'user' && last.text.trim() === text.trim()) return history.slice(0, -1)
  return history
}

export function fallbackReply(saved: SavedLike[]): string {
  const items = saved.filter((s) => s.type !== 'memory')
  if (!items.length) return saved.length ? 'Done.' : ''
  const shown = items.slice(0, 3).map((s) => `${s.type}${s.label ? ` "${s.label}"` : ''}`)
  const more = items.length > 3 ? ` and ${items.length - 3} more` : ''
  return `Done. Saved ${shown.join(', ')}${more}.`
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = 25000,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error('Echo took too long to respond.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// Transcripts that arrive while a send is in flight are queued (joined) and sent afterwards; never dropped.
export function queueTranscript(queued: string | null, next: string): string {
  const t = next.trim()
  return queued ? `${queued} ${t}`.trim() : t
}

/** The /api/echo body as the browser uses it: defaults for missing fields, web search fields only when well-formed. */
export function readEchoResponse(raw: unknown): EchoResponse {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof EchoResponse, unknown>>
  const sources = Array.isArray(d.sources)
    ? d.sources.filter((s): s is { title: string; url: string } => !!s && typeof s === 'object' && typeof s.title === 'string' && typeof s.url === 'string').slice(0, 5).map(({ title, url }) => ({ title, url }))
    : []
  return {
    reply: typeof d.reply === 'string' ? d.reply : '',
    actions: Array.isArray(d.actions) ? d.actions : [],
    memories: Array.isArray(d.memories) ? d.memories : [],
    trace: Array.isArray(d.trace) ? d.trace : [],
    ...(d.error ? { error: true } : {}),
    ...(sources.length ? { sources } : {}),
    ...(d.webSearchRevoked === true ? { webSearchRevoked: true as const } : {}),
    ...(typeof d.webSearchResealed === 'string' && d.webSearchResealed ? { webSearchResealed: d.webSearchResealed } : {}),
  }
}
