import { describe, expect, it } from 'vitest'
import { CONNECTOR_CATEGORIES, CONNECTORS, connectorStatuses, isConnected } from './connectors'

describe('CONNECTORS', () => {
  it('every connector has a known category', () => {
    const known = CONNECTOR_CATEGORIES.map((c) => c.id) as string[]
    for (const c of CONNECTORS) expect(known).toContain(c.category)
  })
})

const status = (docs: { id: string; connected?: boolean; sealed?: string; lat?: unknown; lon?: unknown; service?: unknown; username?: unknown }[], id: string) => connectorStatuses(docs).find((s) => s.id === id)?.status

describe('connectorStatuses', () => {
  it('uses catalog defaults when there are no docs', () => {
    expect(status([], 'nutrition')).toBe('connected')
    expect(status([], 'web-search')).toBe('not_connected')
    expect(status([], 'gmail')).toBe('coming_soon')
  })
  it('lets a doc override an available connector', () => {
    expect(status([{ id: 'nutrition', connected: false }], 'nutrition')).toBe('not_connected')
    expect(status([{ id: 'web-search', connected: true, sealed: 'v1.x.y' }], 'web-search')).toBe('connected')
  })
  it('keeps unavailable connectors coming soon even if a doc says connected', () => {
    expect(status([{ id: 'gmail', connected: true }], 'gmail')).toBe('coming_soon')
  })
  it('ignores unknown ids and follows catalog order', () => {
    const out = connectorStatuses([{ id: 'bogus', connected: true }])
    expect(out.map((s) => s.id)).toEqual(CONNECTORS.map((c) => c.id))
    expect(out.map((s) => s.name)).toContain('Nutrition (USDA)')
  })
})

describe('isConnected', () => {
  it('reads a connector status', () => {
    const s = connectorStatuses([])
    expect(isConnected(s, 'nutrition')).toBe(true)
    expect(isConnected(s, 'web-search')).toBe(false)
    expect(isConnected(s, 'gmail')).toBe(false)
  })

  it('counts web search as connected only with a saved login', () => {
    const web = (docs: { id: string; connected?: boolean; sealed?: unknown }[]) => connectorStatuses(docs).find((c) => c.id === 'web-search')?.status
    expect(web([{ id: 'web-search', connected: true }])).toBe('not_connected')
    expect(web([{ id: 'web-search', connected: true, sealed: '' }])).toBe('not_connected')
    expect(web([{ id: 'web-search', connected: true, sealed: 'v1.x.y' }])).toBe('connected')
    expect(connectorStatuses([{ id: 'nutrition', connected: true }]).find((c) => c.id === 'nutrition')?.status).toBe('connected')
  })

  it('counts weather as connected only with a saved location', () => {
    const w = (docs: { id: string; connected?: boolean; lat?: unknown; lon?: unknown }[]) => status(docs, 'weather')
    expect(w([])).toBe('not_connected')
    expect(w([{ id: 'weather', connected: true }])).toBe('not_connected')
    expect(w([{ id: 'weather', connected: true, lat: 14.6 }])).toBe('not_connected')
    expect(w([{ id: 'weather', connected: true, lat: Number.NaN, lon: 121 }])).toBe('not_connected')
    expect(w([{ id: 'weather', connected: true, lat: '14.6', lon: '121' }])).toBe('not_connected')
    expect(w([{ id: 'weather', connected: false, lat: 14.6, lon: 121 }])).toBe('not_connected')
    expect(w([{ id: 'weather', connected: true, lat: 14.6, lon: 121 }])).toBe('connected')
    expect(w([{ id: 'weather', connected: true, lat: 0, lon: 0 }])).toBe('connected')
  })

  it('catalogs music as available and keeps spotify coming soon', () => {
    const m = CONNECTORS.find((c) => c.id === 'music')
    expect(m?.name).toBe('Music (ListenBrainz)')
    expect(m?.available).toBe(true)
    expect(CONNECTORS.find((c) => c.id === 'spotify')?.available).toBe(false)
  })

  it('counts music as connected only with service listenbrainz and a username', () => {
    const m = (docs: { id: string; connected?: boolean; service?: unknown; username?: unknown }[]) => status(docs, 'music')
    expect(m([])).toBe('not_connected')
    expect(m([{ id: 'music', connected: true }])).toBe('not_connected')
    expect(m([{ id: 'music', connected: true, service: 'listenbrainz' }])).toBe('not_connected')
    expect(m([{ id: 'music', connected: true, username: 'bob' }])).toBe('not_connected')
    expect(m([{ id: 'music', connected: true, service: 'spotify', username: 'bob' }])).toBe('not_connected')
    expect(m([{ id: 'music', connected: true, service: 'listenbrainz', username: '   ' }])).toBe('not_connected')
    expect(m([{ id: 'music', connected: true, service: 'listenbrainz', username: 5 }])).toBe('not_connected')
    expect(m([{ id: 'music', connected: false, service: 'listenbrainz', username: 'bob' }])).toBe('not_connected')
    expect(m([{ id: 'music', connected: true, service: 'lastfm', username: 'bob' }])).toBe('not_connected')
    expect(m([{ id: 'music', connected: true, service: 'listenbrainz', username: 'bob' }])).toBe('connected')
  })
})
