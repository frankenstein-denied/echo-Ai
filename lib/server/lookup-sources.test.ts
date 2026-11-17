import { describe, expect, it, vi } from 'vitest'
import { fetchLookup, LookupError, parseCurrencyQuery, parseHolidayQuery } from './lookup-sources'

const NOW = new Date('2026-11-17T10:00:00Z')
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
/** A fetch that answers each URL substring with a body. */
const routes = (map: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    const key = Object.keys(map).find((k) => url.includes(k))
    return key ? ok(map[key]) : new Response('nope', { status: 404 })
  })
const run = (source: Parameters<typeof fetchLookup>[0], query: string, f: ReturnType<typeof vi.fn>, env: Record<string, string | undefined> = {}) =>
  fetchLookup(source, query, { fetchImpl: f as never, now: NOW, env, timeoutMs: 1000 })

describe('parseCurrencyQuery', () => {
  it('reads amount, base and targets in common shapes', () => {
    expect(parseCurrencyQuery('100 USD PHP')).toEqual({ amount: 100, from: 'USD', to: ['PHP'] })
    expect(parseCurrencyQuery('1,250.50 usd to php')).toEqual({ amount: 1250.5, from: 'USD', to: ['PHP'] })
    expect(parseCurrencyQuery('EUR to USD, JPY')).toEqual({ amount: 1, from: 'EUR', to: ['USD', 'JPY'] })
    expect(parseCurrencyQuery('gbp')).toEqual({ amount: 1, from: 'GBP', to: [] })
  })
  it('rejects text without a currency code', () => {
    expect(parseCurrencyQuery('how much is a dollar')).toBeNull()
  })
})

describe('parseHolidayQuery', () => {
  it('reads a country code and year, defaulting to this year', () => {
    expect(parseHolidayQuery('PH 2027', NOW)).toEqual({ country: 'PH', year: 2027 })
    expect(parseHolidayQuery('us', NOW)).toEqual({ country: 'US', year: 2026 })
    expect(parseHolidayQuery('holidays in PH', NOW)).toEqual({ country: 'PH', year: 2026 })
  })
  it('rejects a query without a country code', () => {
    expect(parseHolidayQuery('2026', NOW)).toBeNull()
  })
})

describe('fetchLookup', () => {
  it('wikipedia: searches, then reads the top summaries', async () => {
    const f = routes({
      'search/page': { pages: [{ key: 'José_Rizal', title: 'José Rizal' }] },
      'page/summary/Jos%C3%A9_Rizal': { title: 'José Rizal', extract: 'Filipino nationalist and writer.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Jos%C3%A9_Rizal' } } },
    })
    const r = await run('wikipedia', 'jose rizal', f)
    expect(r).toEqual([{ title: 'José Rizal (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Jos%C3%A9_Rizal', content: 'Filipino nationalist and writer.' }])
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^EchoAI\//)
  })

  it('currency: converts with the dated rate', async () => {
    const f = routes({ 'frankfurter.dev/v1/latest?base=USD&symbols=PHP': { amount: 1, base: 'USD', date: '2026-11-16', rates: { PHP: 63.954 } } })
    const [r] = await run('currency', '100 USD PHP', f)
    expect(r.url).toBe('https://frankfurter.dev')
    expect(r.content).toContain('100 USD = 6,395.4 PHP')
    expect(r.content).toContain('2026-11-16')
  })

  it('currency: a query without codes is a bad query', async () => {
    await expect(run('currency', 'money', routes({}))).rejects.toMatchObject({ kind: 'bad_query' })
  })

  it('holidays: lists the year with local names', async () => {
    const f = routes({ 'PublicHolidays/2026/PH': [{ date: '2026-12-30', localName: 'Araw ni Rizal', name: 'Rizal Day' }] })
    const [r] = await run('holidays', 'PH', f)
    expect(r.content).toContain('2026-12-30: Rizal Day (Araw ni Rizal)')
    expect(r.title).toBe('Public holidays in PH, 2026')
  })

  it('books: maps title, author and year', async () => {
    const f = routes({ 'openlibrary.org/search.json': { docs: [{ key: '/works/OL1622789W', title: 'Noli Me Tangere', author_name: ['José Rizal'], first_publish_year: 1902 }] } })
    expect(await run('books', 'noli me tangere', f)).toEqual([{ title: 'Noli Me Tangere', url: 'https://openlibrary.org/works/OL1622789W', content: 'Noli Me Tangere by José Rizal, first published 1902.' }])
  })

  it('food-facts: a barcode reads the product directly', async () => {
    const f = routes({ 'api/v2/product/3017620422003.json': { product: { code: '3017620422003', product_name: 'Nutella', brands: 'Ferrero', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, sugars_100g: 56.3, fat_100g: 30.9 }, nutriscore_grade: 'e' } } })
    const [r] = await run('food-facts', '3017 6204 22003', f)
    expect(r.url).toBe('https://world.openfoodfacts.org/product/3017620422003')
    expect(r.content).toContain('Per 100 g: 539 kcal')
    expect(r.content).toContain('Nutri-Score: E')
  })

  it('news: needs GNEWS_API_KEY and never puts the key in a result', async () => {
    await expect(run('news', 'top', routes({}))).rejects.toMatchObject({ kind: 'not_configured' })
    const f = routes({ 'gnews.io/api/v4/top-headlines': { articles: [{ title: 'Big story', description: 'What happened.', url: 'https://news.example/a', publishedAt: '2026-11-17T08:00:00Z', source: { name: 'Example News' } }] } })
    const r = await run('news', 'top headlines', f, { GNEWS_API_KEY: 'secret-key' })
    expect(r).toEqual([{ title: 'Big story (Example News)', url: 'https://news.example/a', content: 'What happened. Published 2026-11-17.' }])
    expect(JSON.stringify(r)).not.toContain('secret-key')
  })

  it('news: a topic searches instead of top headlines', async () => {
    const f = routes({ 'gnews.io/api/v4/search?q=lakers': { articles: [] } })
    expect(await run('news', 'lakers', f, { GNEWS_API_KEY: 'k' })).toEqual([])
  })

  it('movies: uses a bearer token for a read-access token and maps results', async () => {
    const f = routes({ 'api.themoviedb.org/3/search/multi': { results: [{ id: 27205, media_type: 'movie', title: 'Inception', release_date: '2010-07-15', vote_average: 8.4, overview: 'A thief who steals secrets.' }, { id: 1, media_type: 'person', name: 'Someone' }] } })
    const r = await run('movies', 'inception', f, { TMDB_API_KEY: 'eyJhbGciOi.token' })
    expect(r).toEqual([{ title: 'Inception (2010, movie)', url: 'https://www.themoviedb.org/movie/27205', content: 'Rating 8.4/10. A thief who steals secrets.' }])
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain('api_key')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer eyJhbGciOi.token')
  })

  it('maps HTTP errors to kinds', async () => {
    const status = (s: number) => vi.fn(async () => new Response('x', { status: s }))
    await expect(run('books', 'x', status(429))).rejects.toMatchObject({ kind: 'quota' })
    await expect(run('books', 'x', status(500))).rejects.toMatchObject({ kind: 'failed' })
    await expect(run('movies', 'x', status(401), { TMDB_API_KEY: 'k' })).rejects.toMatchObject({ kind: 'not_configured' })
    const err = await run('books', 'x', status(500)).catch((e) => e)
    expect(err).toBeInstanceOf(LookupError)
  })
})
