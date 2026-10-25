import { describe, expect, it } from 'vitest'
import { transcribe, VoiceError, voiceErrorFromStatus } from './voice-client'

describe('voiceErrorFromStatus', () => {
  it.each([
    [401, 'unauthorized'],
    [429, 'quota'],
    [502, 'failed'],
    [413, 'failed'],
    [415, 'failed'],
    [400, 'failed'],
    [500, 'failed'],
  ])('%i -> %s', (s, k) => {
    const e = voiceErrorFromStatus(s)
    expect(e).toBeInstanceOf(VoiceError)
    expect(e.kind).toBe(k)
  })
  it('quota body on other status', () => expect(voiceErrorFromStatus(502, { error: 'quota' }).kind).toBe('quota'))
})

describe('call', () => {
  const user = { getIdToken: async () => 'tok' }
  it('sends bearer token and maps errors', async () => {
    let auth = ''
    const f = (async (_u: string, init: RequestInit) => {
      auth = (init.headers as Record<string, string>).Authorization
      return new Response(JSON.stringify({ error: 'quota' }), { status: 429 })
    }) as unknown as typeof fetch
    await expect(transcribe(user, new Blob(['x']), { fetchImpl: f })).rejects.toMatchObject({ kind: 'quota' })
    expect(auth).toBe('Bearer tok')
  })
  it('network failure -> failed; ok -> trimmed text', async () => {
    const bad = (async () => {
      throw new TypeError('net')
    }) as unknown as typeof fetch
    await expect(transcribe(user, new Blob(['x']), { fetchImpl: bad })).rejects.toMatchObject({ kind: 'failed' })
    const ok = (async () => new Response(JSON.stringify({ text: ' hi ' }))) as unknown as typeof fetch
    expect(await transcribe(user, new Blob(['x']), { fetchImpl: ok })).toBe('hi')
  })
})
