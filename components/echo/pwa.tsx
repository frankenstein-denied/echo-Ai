'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Download, RefreshCw, Share, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

/**
 * PWA glue.
 * - <PwaRegister/> (mounted once in app/layout.tsx): registers /sw.js in production builds only, captures
 *   `beforeinstallprompt`, and shows an "Update available - Reload" toast when a new service worker takes over.
 * - <InstallAppButton/>: render anywhere (Settings, landing). Renders nothing when already installed / unsupported.
 *   Props: className, dismissible (adds an X and remembers dismissal in localStorage).
 * - <RetryButton/>: used by the /offline page.
 * Test locally: `pnpm build && pnpm start` (the service worker is not registered in `next dev`).
 */

const DISMISS_KEY = 'echo-install-dismissed'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIosSafari() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
}

let captureStarted = false
function startCapture() {
  if (captureStarted || typeof window === 'undefined') return
  captureStarted = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
}
startCapture()

/** Registers the service worker (production only) and shows the update toast. */
export function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    // A controller already present means this is an update, not the first install.
    let hadController = !!navigator.serviceWorker.controller
    const onChange = () => {
      if (hadController) setUpdateReady(true)
      hadController = true
    }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => console.warn('Echo: service worker registration failed', err))
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange)
  }, [])

  // Sign-out on a shared device: drop cached pages so the signed-in shell is not served to the next person.
  const { user } = useAuth()
  const hadUser = useRef(false)
  useEffect(() => {
    if (user) { hadUser.current = true; return }
    if (!hadUser.current) return
    hadUser.current = false
    if (!('serviceWorker' in navigator)) return
    const active = navigator.serviceWorker.controller
    if (active) { active.postMessage({ type: 'purge-pages' }); return }
    if (!('caches' in window)) return
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('echo-')).map(async (k) => {
      const c = await caches.open(k)
      for (const r of await c.keys()) {
        const p = new URL(r.url).pathname
        if (p !== '/offline' && !p.startsWith('/_next/static/') && !p.startsWith('/icons/') && p !== '/manifest.webmanifest') await c.delete(r)
      }
    }))).catch(() => {})
  }, [user])

  if (!updateReady) return null
  return (
    <div role="status" className="fixed inset-x-4 bottom-20 z-50 flex items-center gap-3 rounded-xl border border-border-strong bg-surface-2 p-3 text-sm text-foreground md:inset-x-auto md:bottom-4 md:right-4">
      <RefreshCw size={16} aria-hidden="true" className="shrink-0 text-primary" />
      <span className="flex-1">Update available</span>
      <button type="button" onClick={() => window.location.reload()} className="h-8 rounded-lg bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        Reload
      </button>
      <button type="button" aria-label="Dismiss" onClick={() => setUpdateReady(false)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

const snapshot = () => (deferred ? 1 : 0) + (installed ? 2 : 0)

export function InstallAppButton({ className = '', dismissible = false }: { className?: string; dismissible?: boolean }) {
  useSyncExternalStore(subscribe, snapshot, () => 0)
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    setMounted(true)
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1') } catch {}
  }, [])

  if (!mounted || installed || isStandalone() || (dismissible && dismissed)) return null
  const ios = isIosSafari()
  if (!deferred && !ios) return null

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
  }
  const install = async () => {
    if (!deferred) { setShowIosHint((v) => !v); return }
    const ev = deferred
    deferred = null
    emit()
    await ev.prompt()
    await ev.userChoice.catch(() => null)
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button type="button" onClick={install} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Download size={16} aria-hidden="true" />
        Install Echo
      </button>
      {dismissible && (
        <button type="button" aria-label="Dismiss install prompt" onClick={dismiss} className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <X size={16} aria-hidden="true" />
        </button>
      )}
      {showIosHint && !deferred && (
        <p className="flex basis-full items-center gap-1.5 text-xs text-muted-foreground">
          Tap <Share size={14} aria-hidden="true" /> Share, then Add to Home Screen.
        </p>
      )}
    </div>
  )
}

/** Plain link so it works without hydration (the offline page may be served from cache). */
export function RetryButton() {
  return (
    <a href="/" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <RefreshCw size={16} aria-hidden="true" />
      Try again
    </a>
  )
}
