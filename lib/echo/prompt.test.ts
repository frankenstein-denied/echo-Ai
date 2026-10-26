import { describe, expect, it } from 'vitest'
import { APP_GUIDE } from './app-guide'
import { buildUserContents, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from './prompt'
import type { EchoRequest } from './types'

const req = (connectors?: EchoRequest['context']['connectors']): EchoRequest => ({
  text: 'what is the latest iPhone?',
  clientTime: '2026-10-26T09:00:00+08:00',
  timeZone: 'Asia/Manila',
  context: { profile: '', recentMessages: [], memoryLabels: [], ...(connectors ? { connectors } : {}) },
})

describe('SYSTEM_INSTRUCTION search order and teaching', () => {
  it('has a SEARCH ORDER section with the three steps in order', () => {
    expect(SYSTEM_INSTRUCTION).toContain('SEARCH ORDER')
    const i1 = SYSTEM_INSTRUCTION.indexOf("1. Echo's knowledge")
    const i2 = SYSTEM_INSTRUCTION.indexOf('2. Connectors')
    const i3 = SYSTEM_INSTRUCTION.indexOf('3. Web search')
    expect(i1).toBeGreaterThan(SYSTEM_INSTRUCTION.indexOf('SEARCH ORDER'))
    expect(i2).toBeGreaterThan(i1)
    expect(i3).toBeGreaterThan(i2)
  })

  it("never searches the web for the user's own data or the app", () => {
    expect(SYSTEM_INSTRUCTION).toContain("never search the web for the user's own data or how to use Echo")
  })

  it('teaches for coming-soon connectors instead of pretending', () => {
    expect(SYSTEM_INSTRUCTION).toContain('TEACHING')
    expect(SYSTEM_INSTRUCTION).toContain('"coming soon"')
    expect(SYSTEM_INSTRUCTION).toContain("Spotify isn't connected yet — it's coming soon in Connectors.")
  })

  it('splits TEACHING into connector actions (teach) and information questions (web search fallback)', () => {
    const teaching = SYSTEM_INSTRUCTION.slice(SYSTEM_INSTRUCTION.indexOf('TEACHING ('), SYSTEM_INSTRUCTION.indexOf('EDITING EXISTING ITEMS'))
    expect(teaching).toContain('Action requests')
    expect(teaching).toContain('Information questions')
    expect(teaching).toMatch(/Information questions[^\n]*weather[^\n]*return web_search/)
    expect(SYSTEM_INSTRUCTION).not.toContain('never web_search instead')
    const connectorLine = SYSTEM_INSTRUCTION.split('\n').find((l) => l.startsWith('- connector:')) ?? ''
    expect(connectorLine).toContain('an action')
    expect(connectorLine).not.toMatch(/weather/i)
  })

  it('offers a web_search action in the schema', () => {
    const variants = RESPONSE_SCHEMA.properties.actions.items.anyOf as { properties: { type: { enum?: string[] } }; required?: string[] }[]
    const ws = variants.find((v) => v.properties.type.enum?.includes('web_search'))
    expect(ws?.required).toEqual(['type', 'query'])
  })
})

describe('buildUserContents connectors and app guide', () => {
  it('lists every connector with its status and topics', () => {
    const c = buildUserContents(req([{ id: 'web-search', status: 'connected' }, { id: 'nutrition', status: 'not_connected' }]))
    expect(c).toContain('=== CONNECTORS')
    expect(c).toContain('- Web search (Tavily): connected — current events and facts from the web')
    expect(c).toContain('- Nutrition (USDA): not connected — food calories and macros')
    expect(c).toContain('- Spotify: coming soon — music and listening history')
  })

  it('uses catalog defaults when the browser sent no states, and never marks an unavailable connector connected', () => {
    expect(buildUserContents(req())).toContain('- Nutrition (USDA): connected')
    expect(buildUserContents(req())).toContain('- Web search (Tavily): not connected')
    expect(buildUserContents(req([{ id: 'spotify', status: 'connected' }]))).toContain('- Spotify: coming soon')
  })

  it('includes the APP GUIDE block', () => {
    const c = buildUserContents(req())
    expect(c).toContain('=== APP GUIDE')
    expect(c).toContain(APP_GUIDE)
    expect(APP_GUIDE).toMatch(/Settings/)
    expect(APP_GUIDE).toMatch(/Connectors/)
    expect(APP_GUIDE.split('\n').length).toBeLessThanOrEqual(15)
  })
})
