import { afterEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  setSession: vi.fn(),
  clearSession: vi.fn(),
  setPinned: vi.fn(),
  getStatus: vi.fn(),
  refresh: vi.fn(),
  requestNotificationPermission: vi.fn(),
  openBatterySettings: vi.fn(),
  isFloatingCallActive: vi.fn(),
  setAppCallActive: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => plugin,
}))

import * as bridge from './echo-bridge'

describe('echo-bridge off native', () => {
  it('no-ops and never touches the plugin', async () => {
    await bridge.setNativeSession({ uid: 'u', refreshToken: 'r', apiKey: 'k', projectId: 'p' })
    await bridge.clearNativeSession()
    await bridge.setNativePinned(true)
    await bridge.refreshNativeNotification()
    bridge.queueNativeNotificationRefresh()
    await bridge.openNativeBatterySettings()
    expect(await bridge.getNativeStatus()).toBeNull()
    expect(await bridge.requestNativeNotificationPermission()).toBe(false)
    for (const fn of Object.values(plugin)) expect(fn).not.toHaveBeenCalled()
  })
})

describe('echo-bridge in a floating WebView', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it('queueNativeNotificationRefresh calls EchoFloat.refreshNotification once after a burst', () => {
    vi.useFakeTimers()
    const stub = { refreshNotification: vi.fn() }
    vi.stubGlobal('window', { EchoFloat: stub })
    bridge.queueNativeNotificationRefresh()
    bridge.queueNativeNotificationRefresh()
    bridge.queueNativeNotificationRefresh()
    vi.advanceTimersByTime(1000)
    expect(stub.refreshNotification).toHaveBeenCalledTimes(1)
    expect(plugin.refresh).not.toHaveBeenCalled()
  })
})
