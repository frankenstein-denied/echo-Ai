/* Echo service worker (hand-written). Bump VERSION to invalidate caches. */
importScripts('/sw-routing.js')

const VERSION = 'v1'
const CACHE = `echo-${VERSION}`
const OFFLINE_URL = '/offline'
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('echo-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const strategy = self.decideStrategy(event.request, self.location.origin)
  if (strategy === 'bypass') return
  const waitUntil = (p) => event.waitUntil(p)
  event.respondWith(
    caches.open(CACHE).then((cache) => {
      const deps = { fetch: (r) => fetch(r), cache, offlineUrl: OFFLINE_URL, waitUntil }
      return strategy === 'navigate' ? self.handleNavigate(event.request, deps) : self.handleStatic(event.request, deps)
    })
  )
})

// Sent by the page on sign-out so a shared device does not keep a signed-in shell.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'purge-pages') {
    event.waitUntil(caches.open(CACHE).then((c) => self.purgePages(c, OFFLINE_URL)))
  }
})
