import { describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  setSession: vi.fn(),
  clearSession: vi.fn(),
  setPinned: vi.fn(),
  getStatus: vi.fn(),
  refresh: vi.fn(),
  requestNotificationPermission: vi.fn(),
  openBatterySettings: vi.fn(),
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
    await bridge.openNativeBatterySettings()
    expect(await bridge.getNativeStatus()).toBeNull()
    expect(await bridge.requestNativeNotificationPermission()).toBe(false)
    for (const fn of Object.values(plugin)) expect(fn).not.toHaveBeenCalled()
  })
})
