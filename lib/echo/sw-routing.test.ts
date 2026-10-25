import { describe, expect, it } from 'vitest'
import { decideStrategy, handleNavigate, handleStatic, purgePages } from '../../public/sw-routing.js'

const O = 'https://echo.test'
const r = (url: string, method = 'GET', mode = 'cors') => ({ url, method, mode })

describe('decideStrategy', () => {
  it('never touches /api or non-GET', () => {
    expect(decideStrategy(r(`${O}/api/echo`), O)).toBe('bypass')
    expect(decideStrategy(r(`${O}/api/voice/voices`, 'GET', 'navigate'), O)).toBe('bypass')
    expect(decideStrategy(r(`${O}/`, 'POST', 'navigate'), O)).toBe('bypass')
    expect(decideStrategy(r(`${O}/_next/static/a.js`, 'POST'), O)).toBe('bypass')
  })
  it('bypasses cross-origin (Firebase/Google)', () => {
    expect(decideStrategy(r('https://firestore.googleapis.com/x'), O)).toBe('bypass')
    expect(decideStrategy(r('https://www.googleapis.com/y', 'GET', 'navigate'), O)).toBe('bypass')
  })
  it('navigations are network-first, static assets cache-first', () => {
    expect(decideStrategy(r(`${O}/`, 'GET', 'navigate'), O)).toBe('navigate')
    expect(decideStrategy(r(`${O}/_next/static/chunks/a.js`), O)).toBe('static')
    expect(decideStrategy(r(`${O}/icons/icon-192.png`), O)).toBe('static')
  })
  it('other same-origin fetches (RSC, data) bypass', () => {
    expect(decideStrategy(r(`${O}/?_rsc=1`), O)).toBe('bypass')
  })
})

function fakeCache(initial: string[] = []) {
  const map = new Map<string, Response>(initial.map((u) => [u, new Response('x')]))
  return {
    map,
    match: async (r: string | { url: string }) => map.get(typeof r === 'string' ? `${O}${r}` : r.url),
    put: async (r: { url: string }, res: Response) => { map.set(r.url, res) },
    keys: async () => [...map.keys()].map((url) => ({ url })),
    delete: async (r: { url: string }) => map.delete(r.url),
  }
}
const pending: Promise<unknown>[] = []
const waitUntil = (p: Promise<unknown>) => { pending.push(p) }

describe('handlers', () => {
  const req = { url: `${O}/diary` }
  it('navigation: caches ok responses, skips no-store, falls back offline', async () => {
    const cache = fakeCache([`${O}/offline`])
    const ok = async () => new Response('page')
    await handleNavigate(req, { fetch: ok, cache, offlineUrl: '/offline', waitUntil })
    await Promise.all(pending)
    expect(cache.map.has(req.url)).toBe(true)
    const c2 = fakeCache([`${O}/offline`])
    const ns = async () => new Response('private', { headers: { 'Cache-Control': 'no-store' } })
    await handleNavigate(req, { fetch: ns, cache: c2, offlineUrl: '/offline', waitUntil })
    await Promise.all(pending)
    expect(c2.map.has(req.url)).toBe(false)
    const down = async () => { throw new Error('offline') }
    const off = await handleNavigate({ url: `${O}/other` }, { fetch: down, cache: c2, offlineUrl: '/offline', waitUntil })
    expect(await off.text()).toBe('x')
    const cached = await handleNavigate(req, { fetch: down, cache, offlineUrl: '/offline', waitUntil })
    expect(await cached.text()).toBe('page')
  })
  it('static: stale-while-revalidate', async () => {
    const u = { url: `${O}/icons/a.png` }
    const cache = fakeCache([u.url])
    const res = await handleStatic(u, { fetch: async () => new Response('fresh'), cache, offlineUrl: '/offline', waitUntil })
    expect(await res.text()).toBe('x')
    await Promise.all(pending)
    expect(await (await cache.match(u))!.text()).toBe('fresh')
  })
  it('purgePages removes pages but keeps assets and offline', async () => {
    const cache = fakeCache([`${O}/offline`, `${O}/`, `${O}/diary`, `${O}/_next/static/a.js`, `${O}/icons/i.png`, `${O}/manifest.webmanifest`])
    await purgePages(cache, '/offline')
    expect([...cache.map.keys()].map((k) => k.replace(O, '')).sort()).toEqual(['/_next/static/a.js', '/icons/i.png', '/manifest.webmanifest', '/offline'])
  })
})
