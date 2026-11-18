// Connector catalog and state resolution. No Firebase/SDK imports: shared by browser and server.

/** Free lookups Echo runs on the server for typed chat and calls (see lib/server/lookup.ts). */
export const LOOKUP_SOURCES = ['wikipedia', 'news', 'currency', 'holidays', 'books', 'movies', 'food-facts'] as const
export type LookupSource = (typeof LOOKUP_SOURCES)[number]

export type ConnectorId = 'nutrition' | 'web-search' | 'weather' | 'google-calendar' | 'gmail' | 'github' | 'notion' | LookupSource
export type ConnectorStatus = 'connected' | 'not_connected' | 'coming_soon'
export type ConnectorCategory = 'ai' | 'health' | 'productivity' | 'knowledge' | 'live'

/** Page sections, in display order. */
export const CONNECTOR_CATEGORIES: readonly { id: ConnectorCategory; label: string }[] = [
  { id: 'ai', label: 'AI models' },
  { id: 'health', label: 'Health & Fitness' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'live', label: 'Live info' },
]

export type ConnectorDef = {
  id: ConnectorId
  name: string
  description: string
  kind: 'builtin' | 'key' | 'oauth'
  category: ConnectorCategory
  available: boolean
  defaultConnected: boolean
  /** What this connector answers, used in the prompt. */
  topics: string
}

export const CONNECTORS: readonly ConnectorDef[] = [
  { id: 'nutrition', name: 'Nutrition (USDA)', description: 'Look up calories and macros in the USDA food database.', kind: 'builtin', category: 'health', available: true, defaultConnected: true, topics: 'food calories and macros' },
  { id: 'web-search', name: 'Web search (Tavily)', description: 'Search the web when Echo and your connectors do not know.', kind: 'oauth', category: 'live', available: true, defaultConnected: false, topics: 'current events and facts from the web' },
  { id: 'weather', name: 'Weather', description: 'Local forecast via Open-Meteo. No account needed.', kind: 'builtin', category: 'live', available: true, defaultConnected: false, topics: 'weather and forecasts' },
  { id: 'food-facts', name: 'Packaged food (Open Food Facts)', description: 'Nutrition and ingredients of packaged food by name or barcode number. Free, no account.', kind: 'builtin', category: 'health', available: true, defaultConnected: true, topics: 'packaged food products: nutrition per 100 g, ingredients, Nutri-Score (by name or barcode number)' },
  { id: 'wikipedia', name: 'Wikipedia', description: 'Facts about people, places, history and topics. Free, no account.', kind: 'builtin', category: 'knowledge', available: true, defaultConnected: true, topics: 'encyclopedia facts about people, places, history, science and topics' },
  { id: 'books', name: 'Books (Open Library)', description: 'Find books, authors and when they were published. Free, no account.', kind: 'builtin', category: 'knowledge', available: true, defaultConnected: true, topics: 'books and authors' },
  { id: 'movies', name: 'Movies & TV (TMDB)', description: 'Look up films and shows: year, rating and plot.', kind: 'builtin', category: 'knowledge', available: true, defaultConnected: true, topics: 'movies and TV shows: release year, rating, plot' },
  { id: 'news', name: 'News (GNews)', description: 'Top headlines and news on a topic.', kind: 'builtin', category: 'live', available: true, defaultConnected: true, topics: 'news headlines and recent news on a topic' },
  { id: 'currency', name: 'Currency rates', description: 'Exchange rates from the European Central Bank (Frankfurter). Free, no account.', kind: 'builtin', category: 'live', available: true, defaultConnected: true, topics: 'currency exchange rates and conversions' },
  { id: 'holidays', name: 'Public holidays', description: 'Public holidays by country (Nager.Date). Free, no account.', kind: 'builtin', category: 'live', available: true, defaultConnected: true, topics: 'public holidays by country and year' },
  { id: 'google-calendar', name: 'Google Calendar', description: 'Read and create events.', kind: 'oauth', category: 'productivity', available: false, defaultConnected: false, topics: 'calendar events and schedule' },
  { id: 'gmail', name: 'Gmail', description: 'Summarize and draft emails.', kind: 'oauth', category: 'productivity', available: false, defaultConnected: false, topics: 'email' },
  { id: 'github', name: 'GitHub', description: 'Read activity and commits.', kind: 'oauth', category: 'productivity', available: false, defaultConnected: false, topics: 'code activity and commits' },
  { id: 'notion', name: 'Notion', description: 'Read and create pages.', kind: 'oauth', category: 'productivity', available: false, defaultConnected: false, topics: 'notes and pages in Notion' },
]

export type ConnectorState = { id: ConnectorId; name: string; status: ConnectorStatus }

// A sign-in connector only counts as connected when its saved login is present: a doc that says connected but has
// no `sealed` (e.g. a half-finished login) would show "Connected" while Echo can't use it.
// Weather likewise needs its saved location (finite `lat` and `lon`).
export function connectorStatuses(docs: { id: string; connected?: boolean; sealed?: unknown; lat?: unknown; lon?: unknown }[]): ConnectorState[] {
  const byId = new Map(docs.map((d) => [d.id, d]))
  return CONNECTORS.map((c) => {
    const doc = byId.get(c.id)
    const flag = doc && typeof doc.connected === 'boolean' ? doc.connected : c.defaultConnected
    const hasLocation = Number.isFinite(doc?.lat) && Number.isFinite(doc?.lon) && typeof doc?.lat === 'number' && typeof doc?.lon === 'number'
    const connected = flag && (c.id === 'weather' ? hasLocation : c.kind === 'builtin' || (typeof doc?.sealed === 'string' && doc.sealed.length > 0))
    const status: ConnectorStatus = !c.available ? 'coming_soon' : connected ? 'connected' : 'not_connected'
    return { id: c.id, name: c.name, status }
  })
}

export function isConnected(statuses: { id: ConnectorId; status: ConnectorStatus }[], id: ConnectorId): boolean {
  return statuses.some((s) => s.id === id && s.status === 'connected')
}
