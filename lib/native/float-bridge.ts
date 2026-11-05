import { parseEmbedMode, type EmbedMode } from '@/lib/echo/embed'
import { nativeFloatingCallActive, nativeSetAppCallActive } from './echo-bridge'

/** Injected by the Android floating-Echo WebViews (never present on the web or in the Capacitor shell). */
interface EchoFloatApi {
  onCallPhase(phase: string): void
  onCallEnded(reason: string): void
  onSignedOut(): void
  openInApp(): void
  refreshNotification(): void
}

const api = (): EchoFloatApi | null => {
  if (typeof window === 'undefined') return null
  return (window as unknown as { EchoFloat?: EchoFloatApi }).EchoFloat ?? null
}

export const hasFloatBridge = (): boolean => api() !== null

/** Embed mode for this page. Native injects the bridge before the first load; without it (any browser) ?embed= means nothing. */
export const currentEmbedMode = (): EmbedMode | null => (hasFloatBridge() ? parseEmbedMode(window.location.search) : null)

const call = (fn: (a: EchoFloatApi) => void) => {
  const a = api()
  if (!a) return
  try {
    fn(a)
  } catch {
    // A native hiccup must never break the page.
  }
}

export const reportCallPhase = (phase: string): void => call((a) => a.onCallPhase(phase))
export const reportCallEnded = (reason: string): void => call((a) => a.onCallEnded(reason))
export const reportSignedOut = (): void => call((a) => a.onSignedOut())
export const openFullApp = (): void => call((a) => a.openInApp())
export const requestFloatRefresh = (): void => call((a) => a.refreshNotification())

/** True while the floating call runs. A 1.2 APK without the method (or a non-native page) reads as false. */
export async function isFloatingCallActive(): Promise<boolean> {
  try {
    return await nativeFloatingCallActive()
  } catch {
    return false
  }
}

/** Like isFloatingCallActive, but gives up (false) after timeoutMs so a slow or old native side never blocks a call. */
export function floatingCallActiveWithin(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), timeoutMs)
    isFloatingCallActive().then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(false)
      },
    )
  })
}

/** Tells native whether the full app is in a call, so a floating call is not started on top of it. */
export async function setAppCallActive(active: boolean): Promise<void> {
  try {
    await nativeSetAppCallActive(active)
  } catch {
    // Older APK: nothing to tell.
  }
}

/** A new full-app page has no call, whatever the last page said before it died. Skipped in the floating WebViews. */
export async function clearAppCallOnLoad(): Promise<void> {
  if (!hasFloatBridge()) await setAppCallActive(false)
}
