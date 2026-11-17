import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EchoResponse } from '@/lib/echo/types'
import { LookupError } from './lookup-sources'
import { LOOKUP_LIMITS, resetLookupSlots, resolveLookup, type LookupDeps } from './lookup'

const res = (actions: EchoResponse['actions'], reply = ''): EchoResponse => ({ reply, actions, memories: [{ label: 'Rizal', type: 'interest', links: [] }] as never, trace: ['t'] })
const lookup = (source: 'wikipedia' | 'news' | 'currency' = 'wikipedia', query = 'jose rizal') => res([{ type: 'lookup', source, query }])
const hit = [{ title: 'José Rizal (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Rizal', content: 'Filipino nationalist.' }]

function deps(over: Partial<LookupDeps> = {}): LookupDeps {
  return {
    uid: 'u1',
    question: 'who is jose rizal',
    clientTime: '2026-11-17 10:00',
    profile: '',
    fetch: vi.fn(async () => hit),
    answer: vi.fn(async () => ({ reply: 'He was a Filipino nationalist.', sources: [{ title: hit[0].title, url: hit[0].url }] })),
    ...over,
  }
}

beforeEach(() => {
  resetLookupSlots()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('resolveLookup', () => {
  it('passes a response without a lookup through untouched', async () => {
    const r = res([{ type: 'web_search', query: 'x' }])
    expect(await resolveLookup(r, deps())).toBe(r)
  })

  it('answers from the source, cites it and keeps memories', async () => {
    const d = deps()
    const out = await resolveLookup(lookup(), d)
    expect(d.fetch).toHaveBeenCalledWith('wikipedia', 'jose rizal', expect.objectContaining({ timeoutMs: expect.any(Number) }))
    expect(out.reply).toBe('He was a Filipino nationalist.')
    expect(out.sources).toEqual([{ title: hit[0].title, url: hit[0].url }])
    expect(out.actions).toEqual([])
    expect(out.memories).toHaveLength(1)
    expect(out.trace.at(-1)).toBe('Looked up Wikipedia')
  })

  it('turns into a web search when the connector is off', async () => {
    const d = deps({ connectors: [{ id: 'wikipedia', status: 'not_connected' }] })
    const out = await resolveLookup(lookup(), d)
    expect(d.fetch).not.toHaveBeenCalled()
    expect(out.actions).toEqual([{ type: 'web_search', query: 'jose rizal' }])
  })

  it('turns into a web search when nothing matched or the source failed', async () => {
    expect((await resolveLookup(lookup(), deps({ fetch: vi.fn(async () => []) }))).actions).toEqual([{ type: 'web_search', query: 'jose rizal' }])
    for (const kind of ['not_configured', 'bad_query', 'quota', 'timeout', 'failed'] as const) {
      const out = await resolveLookup(lookup('news', 'lakers'), deps({ fetch: vi.fn(async () => Promise.reject(new LookupError(kind))) }))
      expect(out.actions).toEqual([{ type: 'web_search', query: 'lakers' }])
    }
  })

  it('a bad currency query searches the user’s own words', async () => {
    const out = await resolveLookup(lookup('currency', 'dollars to pesos'), deps({ question: 'how much is 5 dollars in pesos', fetch: vi.fn(async () => Promise.reject(new LookupError('bad_query'))) }))
    expect(out.actions).toEqual([{ type: 'web_search', query: 'dollars to pesos' }])
  })

  it('falls back to a web search after the hourly limit', async () => {
    const d = deps()
    for (let i = 0; i < LOOKUP_LIMITS.perHour; i++) await resolveLookup(lookup(), d)
    const out = await resolveLookup(lookup(), d)
    expect(out.actions).toEqual([{ type: 'web_search', query: 'jose rizal' }])
    expect(d.fetch).toHaveBeenCalledTimes(LOOKUP_LIMITS.perHour)
  })

  it('shows the sources when the answer call fails', async () => {
    const out = await resolveLookup(lookup(), deps({ answer: vi.fn(async () => Promise.reject(new Error('boom'))) }))
    expect(out.reply).toMatch(/Here's what I found/)
    expect(out.sources).toEqual([{ title: hit[0].title, url: hit[0].url }])
    expect(out.actions).toEqual([])
  })

  it('gives up politely when no time is left, never claiming an answer', async () => {
    const d = deps({ deadline: 1000, now: () => 999 })
    const out = await resolveLookup(lookup(), d)
    expect(d.fetch).not.toHaveBeenCalled()
    expect(out.actions).toEqual([])
    expect(out.reply).toMatch(/couldn't look that up/)
  })
})

describe('resolveLookup with an old client', () => {
  it('treats a connector missing from the states as its default (on)', async () => {
    const d = deps({ connectors: [{ id: 'nutrition', status: 'connected' }] })
    const out = await resolveLookup(lookup(), d)
    expect(d.fetch).toHaveBeenCalled()
    expect(out.actions).toEqual([])
  })
})
