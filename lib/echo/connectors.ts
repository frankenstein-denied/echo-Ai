// Connector catalog and state resolution. No Firebase/SDK imports: shared by browser and server.

export type ConnectorId = 'nutrition' | 'web-search' | 'weather' | 'spotify' | 'google-calendar' | 'gmail' | 'github' | 'notion'
export type ConnectorStatus = 'connected' | 'not_connected' | 'coming_soon'

export type ConnectorDef = {
  id: ConnectorId
  name: string
  description: string
  kind: 'builtin' | 'key' | 'oauth'
  available: boolean
  defaultConnected: boolean
  /** What this connector answers, used in the prompt. */
  topics: string
}

export const CONNECTORS: readonly ConnectorDef[] = [
  { id: 'nutrition', name: 'Nutrition (USDA)', description: 'Look up calories and macros in the USDA food database.', kind: 'builtin', available: true, defaultConnected: true, topics: 'food calories and macros' },
  { id: 'web-search', name: 'Web search (Tavily)', description: 'Search the web when Echo and your connectors do not know.', kind: 'oauth', available: true, defaultConnected: false, topics: 'current events and facts from the web' },
  { id: 'weather', name: 'Weather', description: 'Local conditions via Open-Meteo.', kind: 'builtin', available: false, defaultConnected: false, topics: 'weather and forecasts' },
  { id: 'spotify', name: 'Spotify', description: 'Understand listening patterns.', kind: 'oauth', available: false, defaultConnected: false, topics: 'music and listening history' },
  { id: 'google-calendar', name: 'Google Calendar', description: 'Read and create events.', kind: 'oauth', available: false, defaultConnected: false, topics: 'calendar events and schedule' },
  { id: 'gmail', name: 'Gmail', description: 'Summarize and draft emails.', kind: 'oauth', available: false, defaultConnected: false, topics: 'email' },
  { id: 'github', name: 'GitHub', description: 'Read activity and commits.', kind: 'oauth', available: false, defaultConnected: false, topics: 'code activity and commits' },
  { id: 'notion', name: 'Notion', description: 'Read and create pages.', kind: 'oauth', available: false, defaultConnected: false, topics: 'notes and pages in Notion' },
]

export type ConnectorState = { id: ConnectorId; name: string; status: ConnectorStatus }

// A sign-in connector only counts as connected when its saved login is present: a doc that says connected but has
// no `sealed` (e.g. a half-finished login) would show "Connected" while Echo can't use it.
export function connectorStatuses(docs: { id: string; connected?: boolean; sealed?: unknown }[]): ConnectorState[] {
  const byId = new Map(docs.map((d) => [d.id, d]))
  return CONNECTORS.map((c) => {
    const doc = byId.get(c.id)
    const flag = doc && typeof doc.connected === 'boolean' ? doc.connected : c.defaultConnected
    const connected = flag && (c.kind === 'builtin' || (typeof doc?.sealed === 'string' && doc.sealed.length > 0))
    const status: ConnectorStatus = !c.available ? 'coming_soon' : connected ? 'connected' : 'not_connected'
    return { id: c.id, name: c.name, status }
  })
}

export function isConnected(statuses: { id: ConnectorId; status: ConnectorStatus }[], id: ConnectorId): boolean {
  return statuses.some((s) => s.id === id && s.status === 'connected')
}
