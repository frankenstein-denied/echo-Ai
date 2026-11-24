// What to ask Echo for each connector, and how the Connectors page orders them (Needs you → On → Off → Coming soon).
import type { ConnectorId, ConnectorStatus } from './connectors'

/** A short, real sentence per available connector (no quotes; the page adds them). */
export const CONNECTOR_EXAMPLES: Partial<Record<ConnectorId, string>> = {
  nutrition: 'calories in adobo',
  'web-search': 'search the web for cheap flights',
  weather: 'will it rain this afternoon?',
  claude: 'ask Claude about my plan',
  chatgpt: 'ask ChatGPT for a dinner idea',
  gemini: 'ask Gemini to explain this',
  perplexity: 'ask Perplexity what changed today',
  groq: 'ask Groq for a quick answer',
  openrouter: 'ask OpenRouter for a second opinion',
  'food-facts': 'what’s in Nutella?',
  wikipedia: 'who was José Rizal?',
  books: 'books by Haruki Murakami',
  movies: 'what is Dune about?',
  news: 'latest news on the typhoon',
  currency: '100 dollars in pesos',
  holidays: 'next public holiday',
}

/** "Try: “calories in adobo”", or undefined when the connector has no example (coming soon). */
export function connectorExample(id: ConnectorId): string | undefined {
  const ex = CONNECTOR_EXAMPLES[id]
  return ex ? `Try: “${ex}”` : undefined
}

export type ConnectorSectionId = 'needs' | 'on' | 'off' | 'soon'
const SECTIONS: readonly { id: ConnectorSectionId; label: string }[] = [
  { id: 'needs', label: 'Needs you' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
  { id: 'soon', label: 'Coming soon' },
]

type SectionInput = { status: ConnectorStatus; needsYou?: boolean }

function sectionOf(s: SectionInput): ConnectorSectionId {
  if (s.status === 'coming_soon') return 'soon'
  if (s.status === 'connected') return 'on'
  return s.needsYou ? 'needs' : 'off'
}

/** Sections in display order, each keeping the input order; empty sections are dropped. */
export function connectorSections<T extends SectionInput>(states: readonly T[]): { id: ConnectorSectionId; label: string; items: T[] }[] {
  return SECTIONS.map((sec) => ({ ...sec, items: states.filter((s) => sectionOf(s) === sec.id) })).filter((sec) => sec.items.length > 0)
}

/**
 * True when a connector is waiting on the user: its switch is on but it can't work yet (a sign-in or key that didn't
 * finish, Weather without a place), or Web search, which needs one sign-in, until the user signs in or turns it off.
 */
export function needsYou(id: ConnectorId, doc: { connected?: boolean } | undefined, status: ConnectorStatus): boolean {
  if (status !== 'not_connected') return false
  if (doc?.connected === true) return true
  return id === 'web-search' && doc?.connected !== false
}

/** The header's live line: "9 on · 2 need you". */
export function connectorsLine(states: readonly SectionInput[]): string {
  const on = states.filter((s) => s.status === 'connected').length
  const needs = states.filter((s) => sectionOf(s) === 'needs').length
  return needs ? `${on} on · ${needs} ${needs === 1 ? 'needs' : 'need'} you` : `${on} on`
}
