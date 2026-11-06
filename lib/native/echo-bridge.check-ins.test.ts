import { beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ native: true }))
const plugin = vi.hoisted(() => ({
  setCheckInSettings: vi.fn(),
  getCheckInStatus: vi.fn(),
  openOverlaySettings: vi.fn(),
  markCheckInsRead: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => env.native },
  registerPlugin: () => plugin,
}))

import { getCheckInStatus, markCheckInsRead, openOverlaySettings, setCheckInSettings } from './echo-bridge'

const settings = { enabled: true, everyMinutes: 120, sleepStart: '22:00', sleepEnd: '07:00', waterGoal: 8 }

describe('check-in bridge calls', () => {
  beforeEach(() => {
    env.native = true
    for (const fn of Object.values(plugin)) fn.mockReset()
  })

  it('pass through on a current APK', async () => {
    const status = { overlayAllowed: true, bubbleRemoved: false, batteryOptimized: true }
    plugin.getCheckInStatus.mockResolvedValue(status)
    await setCheckInSettings(settings)
    await openOverlaySettings()
    await markCheckInsRead()
    expect(await getCheckInStatus()).toEqual(status)
    expect(plugin.setCheckInSettings).toHaveBeenCalledWith(settings)
    expect(plugin.openOverlaySettings).toHaveBeenCalledOnce()
    expect(plugin.markCheckInsRead).toHaveBeenCalledOnce()
  })

  it('resolve quietly on an older APK without the methods', async () => {
    for (const fn of Object.values(plugin)) fn.mockRejectedValue(new Error('not implemented'))
    await expect(setCheckInSettings(settings)).resolves.toBeUndefined()
    await expect(openOverlaySettings()).resolves.toBeUndefined()
    await expect(markCheckInsRead()).resolves.toBeUndefined()
    await expect(getCheckInStatus()).resolves.toBeNull()
  })

  it('do nothing off native', async () => {
    env.native = false
    await setCheckInSettings(settings)
    await openOverlaySettings()
    await markCheckInsRead()
    expect(await getCheckInStatus()).toBeNull()
    for (const fn of Object.values(plugin)) expect(fn).not.toHaveBeenCalled()
  })
})
