import { beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ native: true }))
const plugin = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  requestMicrophonePermission: vi.fn(),
  requestLocationPermission: vi.fn(),
  openAppSettings: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => env.native },
  registerPlugin: () => plugin,
}))

import {
  getNativePermissions,
  openNativeAppSettings,
  requestNativeLocation,
  requestNativeMicrophone,
} from './echo-bridge'

const perms = {
  notifications: true,
  microphone: false,
  location: true,
  overlay: false,
  canAskMicrophone: true,
  canAskLocation: true,
  canAskNotifications: true,
}

describe('permission bridge calls', () => {
  beforeEach(() => {
    env.native = true
    for (const fn of Object.values(plugin)) fn.mockReset()
  })

  it('pass through on a current APK', async () => {
    plugin.getPermissions.mockResolvedValue(perms)
    plugin.requestMicrophonePermission.mockResolvedValue({ granted: true })
    plugin.requestLocationPermission.mockResolvedValue({ granted: false })
    expect(await getNativePermissions()).toEqual(perms)
    expect(await requestNativeMicrophone()).toBe(true)
    expect(await requestNativeLocation()).toBe(false)
    await openNativeAppSettings()
    expect(plugin.openAppSettings).toHaveBeenCalledOnce()
  })

  it('resolve quietly on an older APK without the methods', async () => {
    for (const fn of Object.values(plugin)) fn.mockRejectedValue(new Error('not implemented'))
    await expect(getNativePermissions()).resolves.toBeNull()
    await expect(requestNativeMicrophone()).resolves.toBe(false)
    await expect(requestNativeLocation()).resolves.toBe(false)
    await expect(openNativeAppSettings()).resolves.toBeUndefined()
  })

  it('do nothing off native', async () => {
    env.native = false
    expect(await getNativePermissions()).toBeNull()
    expect(await requestNativeMicrophone()).toBe(false)
    expect(await requestNativeLocation()).toBe(false)
    await openNativeAppSettings()
    for (const fn of Object.values(plugin)) expect(fn).not.toHaveBeenCalled()
  })
})
