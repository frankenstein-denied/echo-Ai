import { describe, expect, it } from 'vitest'
import { CONNECTOR_EXAMPLES, connectorExample, connectorSections, connectorsLine, needsYou } from './connector-examples'
import { CONNECTORS, type ConnectorId, type ConnectorStatus } from './connectors'

describe('connector examples', () => {
  it('every available connector has a short example of what to ask Echo', () => {
    for (const c of CONNECTORS.filter((x) => x.available)) {
      const example = CONNECTOR_EXAMPLES[c.id]
      expect(example, c.id).toBeTruthy()
      expect(example!.length, c.id).toBeLessThanOrEqual(40)
      expect(example, c.id).not.toMatch(/^["“]|["”]$/)
    }
  })

  it('wraps the example as a "Try:" line, and has none for coming-soon connectors', () => {
    expect(connectorExample('nutrition')).toBe(`Try: “${CONNECTOR_EXAMPLES.nutrition}”`)
    expect(connectorExample('strava')).toBeUndefined()
  })
})

describe('connectorSections', () => {
  const s = (id: ConnectorId, status: ConnectorStatus, needs = false) => ({ id, status, needsYou: needs })

  it('orders Needs you, On, Off, Coming soon and drops empty sections', () => {
    const out = connectorSections([s('strava', 'coming_soon'), s('weather', 'not_connected'), s('nutrition', 'connected'), s('web-search', 'not_connected', true), s('books', 'connected')])
    expect(out.map((x) => x.id)).toEqual(['needs', 'on', 'off', 'soon'])
    expect(out.map((x) => x.label)).toEqual(['Needs you', 'On', 'Off', 'Coming soon'])
    expect(out[1].items.map((x) => x.id)).toEqual(['nutrition', 'books'])
    expect(out[0].items.map((x) => x.id)).toEqual(['web-search'])
  })

  it('never puts a connected or coming-soon connector under Needs you', () => {
    const out = connectorSections([s('nutrition', 'connected', true), s('strava', 'coming_soon', true)])
    expect(out.map((x) => x.id)).toEqual(['on', 'soon'])
  })

  it('returns nothing for no connectors', () => {
    expect(connectorSections([])).toEqual([])
  })
})

describe('needsYou', () => {
  it('flags a half-finished sign-in or a weather switch without a place', () => {
    expect(needsYou('claude', { connected: true }, 'not_connected')).toBe(true)
    expect(needsYou('weather', { connected: true }, 'not_connected')).toBe(true)
  })
  it('flags Web search until the user signs in or turns it off', () => {
    expect(needsYou('web-search', undefined, 'not_connected')).toBe(true)
    expect(needsYou('web-search', { connected: false }, 'not_connected')).toBe(false)
    expect(needsYou('web-search', { connected: true }, 'connected')).toBe(false)
  })
  it('leaves ordinary off and coming-soon connectors alone', () => {
    expect(needsYou('claude', undefined, 'not_connected')).toBe(false)
    expect(needsYou('weather', { connected: false }, 'not_connected')).toBe(false)
    expect(needsYou('strava', { connected: true }, 'coming_soon')).toBe(false)
  })
})

describe('connectorsLine', () => {
  it('counts what is on and what needs the user', () => {
    expect(connectorsLine([{ status: 'connected' }, { status: 'connected', needsYou: false }, { status: 'not_connected', needsYou: true }, { status: 'coming_soon' }])).toBe('2 on · 1 needs you')
    expect(connectorsLine([{ status: 'connected' }, { status: 'not_connected', needsYou: true }, { status: 'not_connected', needsYou: true }])).toBe('1 on · 2 need you')
    expect(connectorsLine([{ status: 'not_connected' }])).toBe('0 on')
  })
})
