import type { LookupSource } from '@/lib/echo/connectors'
import type { WebResult } from './tavily'

// Free lookups behind the Wikipedia, News, Currency, Holidays, Books, Movies and Packaged food connectors. Each source
// returns WebResult-shaped facts (title, url, content) so the web answer step can write the reply and cite them.
// Never log the query, the results or the API keys.

export class LookupError extends Error {
  constructor(public kind: 'not_configured' | 'bad_query' | 'quota' | 'timeout' | 'failed') {
    super(`lookup ${kind}`)
    this.name = 'LookupError'
  }
}

export type LookupOptions = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** "Now" for the holidays year. */
  now?: Date
  env?: Record<string, string | undefined>
}

/** Generic client name (Wikipedia asks API clients to identify themselves). */
const USER_AGENT = 'EchoAI/1.0 (https://github.com/frankenstein-denied/echo-Ai)'
const DEFAULT_TIMEOUT_MS = 8000
const MAX_RESULTS = 5
const MAX_CONTENT = 700

const clip = (s: unknown, max = MAX_CONTENT) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null)
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

async function getJson(url: string, opts: LookupOptions, headers: Record<string, string> = {}, onStatus?: (status: number) => LookupError | null): Promise<unknown> {
  let res: Response
  try {
    res = await (opts.fetchImpl ?? fetch)(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) })
  } catch (err) {
    const name = (err as { name?: string })?.name
    throw new LookupError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'failed')
  }
  if (!res.ok) {
    const mapped = onStatus?.(res.status)
    if (mapped) throw mapped
    if (res.status === 429) throw new LookupError('quota')
    if (res.status === 401) throw new LookupError('not_configured')
    throw new LookupError('failed')
  }
  try {
    return await res.json()
  } catch {
    throw new LookupError('failed')
  }
}

// ---------- query parsing ----------

const CODE_RE = /\b[a-z]{3}\b/gi
const NOT_CODES = new Set(['TO', 'AND', 'THE', 'IN', 'FOR', 'HOW', 'ARE', 'YOU', 'WHAT', 'RATE', 'MUCH', 'MANY'])

/** "100 USD PHP", "1,250 usd to php", "EUR to USD, JPY", "gbp" (amount defaults to 1). */
export function parseCurrencyQuery(q: string): { amount: number; from: string; to: string[] } | null {
  const codes = (q.match(CODE_RE) ?? []).map((c) => c.toUpperCase()).filter((c) => !NOT_CODES.has(c))
  if (!codes.length || codes.length > 6) return null
  const m = /\d[\d,]*(?:\.\d+)?/.exec(q)
  const amount = m ? Number(m[0].replace(/,/g, '')) : 1
  return { amount: Number.isFinite(amount) && amount > 0 ? amount : 1, from: codes[0], to: codes.slice(1) }
}

const STOP_2 = new Set(['in', 'on', 'of', 'at', 'to', 'is', 'my', 'by', 'or', 'an', 'as', 'be', 'do', 'it', 'me', 'no', 'so', 'up', 'we'])

/** "PH 2027", "us" (year defaults to now). */
export function parseHolidayQuery(q: string, now: Date): { country: string; year: number } | null {
  // An upper-case code wins ("holidays in PH"); otherwise the first two-letter word that isn't a common one.
  const words = q.match(/\b[a-z]{2}\b/gi) ?? []
  const country = words.find((w) => w === w.toUpperCase()) ?? words.find((w) => !STOP_2.has(w.toLowerCase()))
  if (!country) return null
  const y = /\b(19|20)\d{2}\b/.exec(q)
  return { country: country.toUpperCase(), year: y ? Number(y[0]) : now.getUTCFullYear() }
}

// ---------- sources ----------

async function wikipedia(query: string, opts: LookupOptions): Promise<WebResult[]> {
  const search = (await getJson(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=2`, opts)) as { pages?: { key?: unknown }[] }
  const keys = (search?.pages ?? []).map((p) => p?.key).filter((k): k is string => typeof k === 'string').slice(0, 2)
  const out: WebResult[] = []
  for (const key of keys) {
    try {
      const s = (await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`, opts)) as { title?: unknown; extract?: unknown; content_urls?: { desktop?: { page?: unknown } } }
      const url = s?.content_urls?.desktop?.page
      const extract = clip(s?.extract)
      if (typeof url === 'string' && url.startsWith('https://') && extract) out.push({ title: `${clip(s.title, 200) || key} (Wikipedia)`, url, content: extract })
    } catch {
      // One missing summary shouldn't lose the others.
    }
  }
  return out
}

async function currency(query: string, opts: LookupOptions): Promise<WebResult[]> {
  const p = parseCurrencyQuery(query)
  if (!p) throw new LookupError('bad_query')
  const symbols = p.to.length ? `&symbols=${p.to.join(',')}` : ''
  const d = (await getJson(`https://api.frankfurter.dev/v1/latest?base=${p.from}${symbols}`, opts, {}, (s) => (s === 404 || s === 422 ? new LookupError('bad_query') : null))) as { date?: unknown; rates?: Record<string, unknown> }
  const rates = Object.entries(d?.rates ?? {}).filter((e): e is [string, number] => num(e[1]) !== null).slice(0, 12)
  if (!rates.length) return []
  const lines = rates.map(([code, rate]) => `${fmt(p.amount)} ${p.from} = ${fmt(p.amount * rate)} ${code} (1 ${p.from} = ${rate} ${code})`)
  return [{ title: `Exchange rates for ${p.from}`, url: 'https://frankfurter.dev', content: `${lines.join('; ')}. European Central Bank reference rates dated ${clip(d.date, 20)}.` }]
}

async function holidays(query: string, opts: LookupOptions): Promise<WebResult[]> {
  const p = parseHolidayQuery(query, opts.now ?? new Date())
  if (!p) throw new LookupError('bad_query')
  const list = (await getJson(`https://date.nager.at/api/v3/PublicHolidays/${p.year}/${p.country}`, opts, {}, (s) => (s === 404 || s === 400 ? new LookupError('bad_query') : null))) as { date?: unknown; name?: unknown; localName?: unknown }[]
  if (!Array.isArray(list) || !list.length) return []
  const lines = list.map((h) => {
    const name = clip(h?.name, 80)
    const local = clip(h?.localName, 80)
    return `${clip(h?.date, 10)}: ${name}${local && local !== name ? ` (${local})` : ''}`
  })
  return [{ title: `Public holidays in ${p.country}, ${p.year}`, url: `https://date.nager.at/PublicHoliday/Country/${p.country}/${p.year}`, content: lines.join('; ').slice(0, 2000) }]
}

async function books(query: string, opts: LookupOptions): Promise<WebResult[]> {
  const d = (await getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${MAX_RESULTS}&fields=key,title,author_name,first_publish_year`, opts)) as { docs?: { key?: unknown; title?: unknown; author_name?: unknown; first_publish_year?: unknown }[] }
  return (d?.docs ?? []).flatMap((b) => {
    const title = clip(b?.title, 200)
    if (!title || typeof b.key !== 'string' || !b.key.startsWith('/')) return []
    const authors = Array.isArray(b.author_name) ? b.author_name.filter((a): a is string => typeof a === 'string').slice(0, 3).join(', ') : ''
    const year = num(b.first_publish_year)
    return [{ title, url: `https://openlibrary.org${b.key}`, content: `${title}${authors ? ` by ${authors}` : ''}${year ? `, first published ${year}` : ''}.` }]
  })
}

type OffProduct = { code?: unknown; product_name?: unknown; brands?: unknown; quantity?: unknown; nutriscore_grade?: unknown; ingredients_text?: unknown; nutriments?: Record<string, unknown> }
const OFF_FIELDS = 'code,product_name,brands,quantity,nutriscore_grade,ingredients_text,nutriments'

function offResult(p: OffProduct): WebResult | null {
  const code = typeof p?.code === 'string' && /^\d{6,14}$/.test(p.code) ? p.code : null
  const name = clip(p?.product_name, 150)
  if (!code || !name) return null
  const n = p.nutriments ?? {}
  const per = [
    ['energy-kcal_100g', 'kcal', ''],
    ['proteins_100g', 'g protein', ''],
    ['carbohydrates_100g', 'g carbs', ''],
    ['sugars_100g', 'g sugar', ''],
    ['fat_100g', 'g fat', ''],
    ['salt_100g', 'g salt', ''],
  ]
    .map(([k, unit]) => (num(n[k]) !== null ? `${fmt(num(n[k]) as number)} ${unit}` : ''))
    .filter(Boolean)
  const grade = typeof p.nutriscore_grade === 'string' && /^[a-e]$/i.test(p.nutriscore_grade) ? p.nutriscore_grade.toUpperCase() : ''
  // Labels mark estimated weights with ℮ (sometimes typed as a trailing "e"): drop it.
  const qty = clip(p.quantity, 30).replace(/\s*℮$/u, '').replace(/\s+e$/, '')
  const parts = [`${name}${clip(p.brands, 80) ? ` (${clip(p.brands, 80)})` : ''}${qty ? `, ${qty}` : ''}.`]
  if (per.length) parts.push(`Per 100 g: ${per.join(', ')}.`)
  if (grade) parts.push(`Nutri-Score: ${grade}.`)
  const ingredients = clip(p.ingredients_text, 300)
  if (ingredients) parts.push(`Ingredients: ${ingredients}`)
  return { title: name, url: `https://world.openfoodfacts.org/product/${code}`, content: parts.join(' ') }
}

async function foodFacts(query: string, opts: LookupOptions): Promise<WebResult[]> {
  const digits = query.replace(/[\s-]/g, '')
  if (/^\d{8,14}$/.test(digits)) {
    const d = (await getJson(`https://world.openfoodfacts.org/api/v2/product/${digits}.json?fields=${OFF_FIELDS}`, opts, {}, (s) => (s === 404 ? new LookupError('bad_query') : null))) as { product?: OffProduct }
    const r = d?.product ? offResult({ ...d.product, code: digits }) : null
    return r ? [r] : []
  }
  const d = (await getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&json=1&page_size=3&fields=${OFF_FIELDS}`, opts)) as { products?: OffProduct[] }
  return (d?.products ?? []).map(offResult).filter((r): r is WebResult => r !== null)
}

const HEADLINES_RE = /^(top|latest|today'?s?|breaking)?\s*(news|headlines|top headlines|stories)?\s*(today)?$/i

async function news(query: string, opts: LookupOptions): Promise<WebResult[]> {
  const key = (opts.env ?? process.env).GNEWS_API_KEY?.trim()
  if (!key) throw new LookupError('not_configured')
  const q = query.trim()
  const base = HEADLINES_RE.test(q) ? `https://gnews.io/api/v4/top-headlines?category=general` : `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&sortby=publishedAt`
  const d = (await getJson(`${base}&lang=en&max=${MAX_RESULTS}&apikey=${encodeURIComponent(key)}`, opts, {}, (s) => (s === 403 ? new LookupError('quota') : null))) as { articles?: { title?: unknown; description?: unknown; url?: unknown; publishedAt?: unknown; source?: { name?: unknown } }[] }
  return (d?.articles ?? []).flatMap((a) => {
    const title = clip(a?.title, 200)
    if (!title || typeof a.url !== 'string' || !/^https?:\/\//.test(a.url)) return []
    const src = clip(a.source?.name, 80)
    const date = clip(a.publishedAt, 10)
    return [{ title: `${title}${src ? ` (${src})` : ''}`, url: a.url, content: `${clip(a.description)}${date ? ` Published ${date}.` : ''}`.trim() }]
  })
}

async function movies(query: string, opts: LookupOptions): Promise<WebResult[]> {
  const key = (opts.env ?? process.env).TMDB_API_KEY?.trim()
  if (!key) throw new LookupError('not_configured')
  // A v4 read-access token (a JWT) goes in the header; a v3 API key goes in the query string.
  const bearer = key.startsWith('eyJ')
  const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1${bearer ? '' : `&api_key=${encodeURIComponent(key)}`}`
  const d = (await getJson(url, opts, bearer ? { Authorization: `Bearer ${key}` } : {})) as { results?: { id?: unknown; media_type?: unknown; title?: unknown; name?: unknown; release_date?: unknown; first_air_date?: unknown; vote_average?: unknown; overview?: unknown }[] }
  return (d?.results ?? [])
    .filter((r) => (r?.media_type === 'movie' || r?.media_type === 'tv') && num(r.id) !== null)
    .slice(0, MAX_RESULTS)
    .flatMap((r) => {
      const name = clip(r.media_type === 'movie' ? r.title : r.name, 200)
      if (!name) return []
      const year = clip(r.media_type === 'movie' ? r.release_date : r.first_air_date, 4)
      const rating = num(r.vote_average)
      const kind = r.media_type === 'movie' ? 'movie' : 'TV show'
      return [{ title: `${name} (${year ? `${year}, ` : ''}${kind})`, url: `https://www.themoviedb.org/${r.media_type}/${r.id}`, content: `${rating ? `Rating ${rating.toFixed(1)}/10. ` : ''}${clip(r.overview)}`.trim() }]
    })
}

const SOURCES: Record<LookupSource, (query: string, opts: LookupOptions) => Promise<WebResult[]>> = {
  wikipedia,
  news,
  currency,
  holidays,
  books,
  movies,
  'food-facts': foodFacts,
}

/** Facts for one lookup (≤ 5 results; [] when nothing matched). Throws LookupError. */
export async function fetchLookup(source: LookupSource, query: string, opts: LookupOptions = {}): Promise<WebResult[]> {
  return (await SOURCES[source](query.trim(), opts)).slice(0, MAX_RESULTS)
}
