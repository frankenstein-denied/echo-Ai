import { describe, expect, it } from 'vitest'
import { CONNECTORS, connectorStatuses, isConnected } from './connectors'

const status = (docs: { id: string; connected?: boolean }[], id: string) => connectorStatuses(docs).find((s) => s.id === id)?.status

describe('connectorStatuses', () => {
  it('uses catalog defaults when there are no docs', () => {
    expect(status([], 'nutrition')).toBe('connected')
    expect(status([], 'web-search')).toBe('not_connected')
    expect(status([], 'spotify')).toBe('coming_soon')
  })
  it('lets a doc override an available connector', () => {
    expect(status([{ id: 'nutrition', connected: false }], 'nutrition')).toBe('not_connected')
    expect(status([{ id: 'web-search', connected: true, sealed: 'v1.x.y' }], 'web-search')).toBe('connected')
  })
  it('keeps unavailable connectors coming soon even if a doc says connected', () => {
    expect(status([{ id: 'spotify', connected: true }], 'spotify')).toBe('coming_soon')
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
})
