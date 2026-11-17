import { CONNECTORS, isConnected, type ConnectorId, type ConnectorStatus } from '@/lib/echo/connectors'
import type { EchoResponse } from '@/lib/echo/types'
import { fetchLookup, LookupError, type LookupOptions } from './lookup-sources'
import type { WebResult } from './tavily'

// Resolves a `lookup` action (typed chat): fetch facts from the free connector, then write the reply from them with the
// web answer step. When the connector is off, finds nothing or fails, the lookup becomes a web_search with the same
// query, so resolveWebSearch (which runs next) still answers or teaches. Never log the query or results.

export const LOOKUP_LIMITS = { perHour: 30, windowMs: 3_600_000, sources: 5, reply: 1200 } as const
export const LOOKUP_FAILED_REPLY = "I couldn't look that up just now. Try again in a moment."
export const LOOKUP_SOURCES_ONLY_REPLY = "Here's what I found, but I couldn't write an answer just now."

const FETCH_TIMEOUT_MS = 6000
/** Time kept for the answer call after the fetch. */
const ANSWER_RESERVE_MS = 4000
/** Below this much time left, don't start a lookup. */
const MIN_BUDGET_MS = 6000
const TRACE_MAX = 8

const slots = new Map<string, number[]>()

/** Records a lookup for `uid`; false when it already did LOOKUP_LIMITS.perHour in the last hour (soft, per instance). */
export function takeLookupSlot(uid: string, now = Date.now()): boolean {
  const recent = (slots.get(uid) ?? []).filter((t) => now - t < LOOKUP_LIMITS.windowMs)
  if (recent.length >= LOOKUP_LIMITS.perHour) {
    slots.set(uid, recent)
    return false
  }
  recent.push(now)
  slots.set(uid, recent)
  return true
}

/** Tests only. */
export function resetLookupSlots(): void {
  slots.clear()
}

type Source = { title: string; url: string }

export type LookupDeps = {
  uid: string
  question: string
  clientTime: string
  profile: string
  /** The browser's connector states; absent means every lookup connector is on (their default). */
  connectors?: { id: ConnectorId; status: ConnectorStatus }[]
  answer: (question: string, results: WebResult[], ctx: { clientTime: string; profile: string }) => Promise<{ reply: string; sources: Source[] }>
  deadline?: number
  now?: () => number
  fetch?: (source: Parameters<typeof fetchLookup>[0], query: string, opts: LookupOptions) => Promise<WebResult[]>
}

const nameOf = (id: ConnectorId) => CONNECTORS.find((c) => c.id === id)?.name.replace(/ \(.*\)$/, '') ?? id

export async function resolveLookup(res: EchoResponse, deps: LookupDeps): Promise<EchoResponse> {
  const action = res.actions.find((a) => a.type === 'lookup')
  if (!action) return res
  const now = deps.now ?? Date.now
  const rest = res.actions.filter((a) => a.type !== 'lookup')
  const trace = (line: string) => [...res.trace, line].slice(-TRACE_MAX)
  // Hand the question to web search (it answers when connected, otherwise teaches how to connect it).
  const toWebSearch = (why: string): EchoResponse => ({ ...res, actions: [...rest, { type: 'web_search', query: action.query }], trace: trace(why) })
  const name = nameOf(action.source)

  if (deps.connectors && !isConnected(deps.connectors, action.source)) return toWebSearch(`${name} is off`)
  const remaining = () => (deps.deadline ?? Infinity) - now()
  if (remaining() < MIN_BUDGET_MS) return { ...res, actions: rest, reply: LOOKUP_FAILED_REPLY, trace: trace('No time left to look up') }
  if (!takeLookupSlot(deps.uid, now())) return toWebSearch('Lookup limit reached for this hour')

  let results: WebResult[]
  try {
    results = await (deps.fetch ?? fetchLookup)(action.source, action.query, { timeoutMs: Math.min(FETCH_TIMEOUT_MS, remaining() - ANSWER_RESERVE_MS) })
  } catch (err) {
    const kind = err instanceof LookupError ? err.kind : ((err as { name?: string })?.name ?? 'unknown')
    if (kind === 'not_configured') console.error(`[echo] ${name} lookup is not configured (missing API key)`)
    else console.warn(`[echo] ${action.source} lookup failed:`, kind)
    return toWebSearch(`${name} lookup failed`)
  }
  if (!results.length) return toWebSearch(`${name}: nothing found`)

  const sources = results.slice(0, LOOKUP_LIMITS.sources).map(({ title, url }) => ({ title, url }))
  try {
    const a = await deps.answer(deps.question, results, { clientTime: deps.clientTime, profile: deps.profile })
    return { ...res, actions: rest, reply: a.reply.slice(0, LOOKUP_LIMITS.reply), sources: a.sources.length ? a.sources.slice(0, LOOKUP_LIMITS.sources) : sources, trace: trace(`Looked up ${name}`) }
  } catch (err) {
    const e = err as { status?: number; name?: string }
    console.warn('[echo] lookup answer failed:', e?.status ?? e?.name ?? 'unknown')
    return { ...res, actions: rest, reply: LOOKUP_SOURCES_ONLY_REPLY, sources, trace: trace(`Looked up ${name}`) }
  }
}
