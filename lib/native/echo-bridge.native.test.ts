import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => plugin,
}))

import { queueNativeNotificationRefresh } from './echo-bridge'

describe('queueNativeNotificationRefresh on native', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    plugin.refresh.mockReset()
    plugin.refresh.mockResolvedValue(undefined)
  })
  afterEach(() => vi.useRealTimers())

  it('collapses a burst of saves into one refresh', () => {
    queueNativeNotificationRefresh()
    queueNativeNotificationRefresh()
    queueNativeNotificationRefresh()
    expect(plugin.refresh).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(plugin.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes again for a later save', () => {
    queueNativeNotificationRefresh()
    vi.runAllTimers()
    queueNativeNotificationRefresh()
    vi.runAllTimers()
    expect(plugin.refresh).toHaveBeenCalledTimes(2)
  })

  it('never lets a failed refresh surface as an unhandled rejection', async () => {
    plugin.refresh.mockRejectedValue(new Error('bridge gone'))
    queueNativeNotificationRefresh()
    await vi.runAllTimersAsync()
    expect(plugin.refresh).toHaveBeenCalledTimes(1)
  })
})
