import { Capacitor, registerPlugin } from '@capacitor/core'

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

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!native()) return false
  const r = await EchoBridge.requestNotificationPermission()
  return r.granted
}

export async function openNativeBatterySettings(): Promise<void> {
  if (!native()) return
  await EchoBridge.openBatterySettings()
}
