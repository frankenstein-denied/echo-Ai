// Pure helpers for the Echo service worker (sw.js): routing decision + cache handlers with injectable deps.
// Also unit-tested (lib/echo/sw-routing.test.ts).

// Returns 'bypass' (never touch), 'navigate' (network-first + offline fallback) or 'static' (stale-while-revalidate).
function decideStrategy(req, origin) {
  if (req.method !== 'GET') return 'bypass'
  let url
  try { url = new URL(req.url) } catch { return 'bypass' }
  if (url.origin !== origin) return 'bypass' // Firebase, Google, fonts CDNs, etc.
  const p = url.pathname
  if (p === '/api' || p.startsWith('/api/')) return 'bypass'
  if (req.mode === 'navigate') return 'navigate'
  if (p.startsWith('/_next/static/') || p.startsWith('/icons/') || p === '/manifest.webmanifest') return 'static'
  return 'bypass'
}

function isPageEntry(url, offlineUrl) {
  const p = new URL(url).pathname
  return p !== offlineUrl && !p.startsWith('/_next/static/') && !p.startsWith('/icons/') && p !== '/manifest.webmanifest'
}

// Network-first for navigations. Caches ok, non-redirect, non-no-store responses; falls back to cache then offline page.
// deps: { fetch, cache, offlineUrl, waitUntil }
async function handleNavigate(request, deps) {
  try {
    const res = await deps.fetch(request)
    const cc = (res.headers && res.headers.get('Cache-Control')) || ''
    if (res.ok && !res.redirected && !/no-store/i.test(cc)) deps.waitUntil(deps.cache.put(request, res.clone()).catch(() => {}))
    return res
  } catch {
    return (await deps.cache.match(request)) || (await deps.cache.match(deps.offlineUrl)) || Response.error()
  }
}

// Stale-while-revalidate for static assets.
async function handleStatic(request, deps) {
  const hit = await deps.cache.match(request)
  const update = deps.fetch(request).then((res) => {
    if (res.ok) return deps.cache.put(request, res.clone()).catch(() => {}).then(() => res)
    return res
  })
  if (hit) {
    deps.waitUntil(update.catch(() => {}))
    return hit
  }
  return update
}

// Deletes every cached page (navigation) entry; keeps assets and the offline page.
async function purgePages(cache, offlineUrl) {
  const reqs = await cache.keys()
  await Promise.all(reqs.filter((r) => isPageEntry(r.url, offlineUrl)).map((r) => cache.delete(r)))
}

if (typeof self !== 'undefined') Object.assign(self, { decideStrategy, handleNavigate, handleStatic, purgePages })
if (typeof module !== 'undefined') module.exports = { decideStrategy, handleNavigate, handleStatic, purgePages, isPageEntry }
