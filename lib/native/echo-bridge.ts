import { Capacitor, registerPlugin } from '@capacitor/core'
import { hasFloatBridge, requestFloatRefresh } from './float-bridge'

export type EchoBridgeStatus = {
  pinned: boolean
  notificationsAllowed: boolean
  batteryOptimized: boolean
}

export type EchoSession = { uid: string; refreshToken: string; apiKey: string; projectId: string }

interface EchoBridgePlugin {
  setSession(session: EchoSession): Promise<void>
  clearSession(): Promise<void>
  setPinned(opts: { pinned: boolean }): Promise<void>
  getStatus(): Promise<EchoBridgeStatus>
  refresh(): Promise<void>
  requestNotificationPermission(): Promise<{ granted: boolean }>
  openBatterySettings(): Promise<void>
  isFloatingCallActive(): Promise<{ active: boolean }>
  setAppCallActive(opts: { active: boolean }): Promise<void>
}

const EchoBridge = registerPlugin<EchoBridgePlugin>('EchoBridge')

const native = () => Capacitor.isNativePlatform()

export async function setNativeSession(session: EchoSession): Promise<void> {
  if (!native()) return
  await EchoBridge.setSession(session)
}

export async function clearNativeSession(): Promise<void> {
  if (!native()) return
  await EchoBridge.clearSession()
}

export async function setNativePinned(pinned: boolean): Promise<void> {
  if (!native()) return
  await EchoBridge.setPinned({ pinned })
}

export async function getNativeStatus(): Promise<EchoBridgeStatus | null> {
  if (!native()) return null
  return EchoBridge.getStatus()
}

export async function refreshNativeNotification(): Promise<void> {
  if (!native()) return
  await EchoBridge.refresh()
}

const REFRESH_DELAY_MS = 400
let refreshTimer: ReturnType<typeof setTimeout> | null = null

/** Call after saving something the pinned notification shows. One chat turn can save several items, so a burst collapses into a single reload. */
export function queueNativeNotificationRefresh(): void {
  // The floating WebViews are not the Capacitor shell but still ask native to reload the notification.
  const float = hasFloatBridge()
  if (!native() && !float) return
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    if (float) requestFloatRefresh()
    else EchoBridge.refresh().catch(() => null)
  }, REFRESH_DELAY_MS)
}

export async function nativeFloatingCallActive(): Promise<boolean> {
  if (!native()) return false
  return (await EchoBridge.isFloatingCallActive()).active === true
}

export async function nativeSetAppCallActive(active: boolean): Promise<void> {
  if (!native()) return
  await EchoBridge.setAppCallActive({ active })
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!native()) return false
  const r = await EchoBridge.requestNotificationPermission()
  return r.granted
}

export async function openNativeBatterySettings(): Promise<void> {
  if (!native()) return
  await EchoBridge.openBatterySettings()
}
