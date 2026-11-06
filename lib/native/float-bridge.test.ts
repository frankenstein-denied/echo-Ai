import { afterEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({ isFloatingCallActive: vi.fn(), setAppCallActive: vi.fn() }))
const shell = vi.hoisted(() => ({ native: true }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => shell.native },
  registerPlugin: () => plugin,
}))

import * as fb from './float-bridge'

type W = { EchoFloat?: unknown }
const w = () => globalThis as unknown as W

afterEach(() => {
  delete w().EchoFloat
  shell.native = true
  vi.unstubAllGlobals()
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
  it('reports the panel ready, and does nothing on an older APK without the method', () => {
    vi.stubGlobal('window', globalThis)
    expect(() => fb.reportPanelReady()).not.toThrow()
    w().EchoFloat = { onCallPhase: vi.fn() }
    expect(() => fb.reportPanelReady()).not.toThrow()
    const onPanelReady = vi.fn()
    w().EchoFloat = { onPanelReady }
    fb.reportPanelReady()
    expect(onPanelReady).toHaveBeenCalledTimes(1)
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

describe('currentEmbedMode', () => {
  it('ignores ?embed= in a window without the native bridge', () => {
    vi.stubGlobal('window', { location: { search: '?embed=call' } })
    expect(fb.currentEmbedMode()).toBeNull()
    vi.stubGlobal('window', { location: { search: '?embed=chat' } })
    expect(fb.currentEmbedMode()).toBeNull()
  })
  it('honours ?embed= when the native bridge is there', () => {
    vi.stubGlobal('window', { location: { search: '?embed=call' }, EchoFloat: {} })
    expect(fb.currentEmbedMode()).toBe('call')
    vi.stubGlobal('window', { location: { search: '?embed=chat' }, EchoFloat: {} })
    expect(fb.currentEmbedMode()).toBe('chat')
  })
  it('is a normal page with the bridge but no valid ?embed=', () => {
    vi.stubGlobal('window', { location: { search: '?embed=evil' }, EchoFloat: {} })
    expect(fb.currentEmbedMode()).toBeNull()
  })
  it('is null on the server', () => {
    expect(fb.currentEmbedMode()).toBeNull()
  })
})

describe('clearAppCallOnLoad', () => {
  it('tells native the full app has no call', async () => {
    vi.stubGlobal('window', { location: { search: '' } })
    plugin.setAppCallActive.mockResolvedValue(undefined)
    await fb.clearAppCallOnLoad()
    expect(plugin.setAppCallActive).toHaveBeenCalledTimes(1)
    expect(plugin.setAppCallActive).toHaveBeenCalledWith({ active: false })
  })
  it('swallows plugin errors', async () => {
    vi.stubGlobal('window', { location: { search: '' } })
    plugin.setAppCallActive.mockRejectedValue(new Error('not implemented'))
    await expect(fb.clearAppCallOnLoad()).resolves.toBeUndefined()
  })
  it('does nothing in a floating WebView', async () => {
    vi.stubGlobal('window', { location: { search: '?embed=call' }, EchoFloat: {} })
    await fb.clearAppCallOnLoad()
    expect(plugin.setAppCallActive).not.toHaveBeenCalled()
  })
  it('does nothing on the web', async () => {
    shell.native = false
    vi.stubGlobal('window', { location: { search: '' } })
    await fb.clearAppCallOnLoad()
    expect(plugin.setAppCallActive).not.toHaveBeenCalled()
  })
})
