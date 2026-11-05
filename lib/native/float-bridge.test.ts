import { afterEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({ isFloatingCallActive: vi.fn(), setAppCallActive: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => plugin,
}))

import * as fb from './float-bridge'

type W = { EchoFloat?: unknown }
const w = () => globalThis as unknown as W

afterEach(() => {
  delete w().EchoFloat
  vi.clearAllMocks()
})

describe('float-bridge', () => {
  it('no-ops without window.EchoFloat', () => {
    vi.stubGlobal('window', globalThis)
    expect(fb.hasFloatBridge()).toBe(false)
    expect(() => {
      fb.reportCallPhase('listening')
      fb.reportCallEnded('user')
      fb.reportSignedOut()
      fb.openFullApp()
      fb.requestFloatRefresh()
    }).not.toThrow()
  })
  it('forwards to the stub', () => {
    vi.stubGlobal('window', globalThis)
    const stub = { onCallPhase: vi.fn(), onCallEnded: vi.fn(), onSignedOut: vi.fn(), openInApp: vi.fn(), refreshNotification: vi.fn() }
    w().EchoFloat = stub
    expect(fb.hasFloatBridge()).toBe(true)
    fb.reportCallPhase('thinking')
    fb.reportCallEnded('user')
    fb.reportSignedOut()
    fb.openFullApp()
    fb.requestFloatRefresh()
    expect(stub.onCallPhase).toHaveBeenCalledWith('thinking')
    expect(stub.onCallEnded).toHaveBeenCalledWith('user')
    expect(stub.onSignedOut).toHaveBeenCalled()
    expect(stub.openInApp).toHaveBeenCalled()
    expect(stub.refreshNotification).toHaveBeenCalled()
  })
  it('isFloatingCallActive resolves false when the plugin method rejects', async () => {
    plugin.isFloatingCallActive.mockRejectedValue(new Error('not implemented'))
    expect(await fb.isFloatingCallActive()).toBe(false)
  })
  it('isFloatingCallActive returns the plugin value', async () => {
    plugin.isFloatingCallActive.mockResolvedValue({ active: true })
    expect(await fb.isFloatingCallActive()).toBe(true)
  })
  it('floatingCallActiveWithin gives up after the timeout', async () => {
    vi.useFakeTimers()
    plugin.isFloatingCallActive.mockReturnValue(new Promise(() => undefined))
    const p = fb.floatingCallActiveWithin(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await p).toBe(false)
    vi.useRealTimers()
  })
  it('floatingCallActiveWithin returns a quick answer', async () => {
    plugin.isFloatingCallActive.mockResolvedValue({ active: true })
    expect(await fb.floatingCallActiveWithin(1000)).toBe(true)
  })
  it('setAppCallActive swallows plugin errors', async () => {
    plugin.setAppCallActive.mockRejectedValue(new Error('nope'))
    await expect(fb.setAppCallActive(true)).resolves.toBeUndefined()
    expect(plugin.setAppCallActive).toHaveBeenCalledWith({ active: true })
  })
})
