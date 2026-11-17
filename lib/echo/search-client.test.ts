import { vi } from 'vitest'
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
import { describe, expect, it } from 'vitest'
import { lookupViaApi, searchWebViaApi } from './client'
import { SEARCH_NOT_CONNECTED_REPLY, SEARCH_QUOTA_REPLY, SEARCH_RECONNECT_REPLY, SEARCH_WAKING_REPLY } from './search-replies'

const user = { getIdToken: async () => 'tok' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('searchWebViaApi', () => {
  it('without a sealed key answers not_connected and never fetches', async () => {
    const f = vi.fn()
    const r = await searchWebViaApi(user, 'x', undefined, f as never)
    expect(r.output).toEqual({ error: 'not_connected', tell_user: SEARCH_NOT_CONNECTED_REPLY })
    expect(f).not.toHaveBeenCalled()
  })
  it('returns results with citing rules and passes resealed along', async () => {
    const f = vi.fn(async () => json({ results: [{ title: 'A', url: 'https://a', content: 'c' }], resealed: 's2' }))
    const r = await searchWebViaApi(user, 'x', 'sealed', f as never)
    expect(r.resealed).toBe('s2')
    expect(r.output).toMatchObject({ results: [{ title: 'A', url: 'https://a', content: 'c' }] })
    expect(String(r.output.instructions)).toMatch(/site name/)
    expect(String(r.output.instructions)).toMatch(/never change/i)
  })
  it('maps a waking error to its own tell_user', async () => {
    const r = await searchWebViaApi(user, 'x', 's', (async () => json({ error: 'waking' }, 504)) as never)
    expect(r.output).toEqual({ error: 'waking', tell_user: SEARCH_WAKING_REPLY })
  })
  it('maps errors to tell_user and flags a disconnect on reconnect', async () => {
    const rc = await searchWebViaApi(user, 'x', 's', (async () => json({ error: 'reconnect' })) as never)
    expect(rc).toMatchObject({ output: { error: 'reconnect', tell_user: SEARCH_RECONNECT_REPLY }, disconnect: true })
    const q = await searchWebViaApi(user, 'x', 's', (async () => json({ error: 'quota', resealed: 'r' }, 429)) as never)
    expect(q).toMatchObject({ output: { error: 'quota', tell_user: SEARCH_QUOTA_REPLY }, resealed: 'r' })
    const bad = await searchWebViaApi(user, 'x', 's', (async () => {
      throw new Error('net')
    }) as never)
    expect(bad.output).toMatchObject({ error: 'failed' })
  })
  it('answers waking when the client-side timeout fires, but plain network errors stay failed', async () => {
    vi.useFakeTimers()
    try {
      const hang = (_u: string, init: RequestInit) => new Promise<Response>((_, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
      const p = searchWebViaApi(user, 'x', 's', hang as never)
      await vi.advanceTimersByTimeAsync(19001)
      expect((await p).output).toEqual({ error: 'waking', tell_user: SEARCH_WAKING_REPLY })
    } finally {
      vi.useRealTimers()
    }
    const net = await searchWebViaApi(user, 'x', 's', (async () => {
      throw new TypeError('Failed to fetch')
    }) as never)
    expect(net.output).toMatchObject({ error: 'failed' })
  })
})

describe('lookupViaApi', () => {
  const user = { getIdToken: async () => 'tok' }
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  it('returns results with answer instructions', async () => {
    const f = vi.fn(async () => json({ results: [{ title: 't', url: 'https://x', content: 'c' }] }))
    const out = await lookupViaApi(user, 'wikipedia', 'rizal', f as never)
    expect(out.results).toEqual([{ title: 't', url: 'https://x', content: 'c' }])
    expect(out.instructions).toMatch(/name the source/)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/lookup')
    expect(JSON.parse(init.body as string)).toEqual({ source: 'wikipedia', query: 'rizal' })
  })
  it('turns empty results, errors and failures into unavailable', async () => {
    const unavailable = { error: 'unavailable', next: 'use web_search with the same question' }
    expect(await lookupViaApi(user, 'news', 'x', vi.fn(async () => json({ results: [] })) as never)).toEqual(unavailable)
    expect(await lookupViaApi(user, 'news', 'x', vi.fn(async () => json({ error: 'unavailable' }, 429)) as never)).toEqual(unavailable)
    expect(await lookupViaApi(user, 'news', 'x', vi.fn(async () => Promise.reject(new Error('net'))) as never)).toEqual(unavailable)
  })
})
