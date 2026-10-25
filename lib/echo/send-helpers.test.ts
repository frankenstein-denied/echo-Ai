import { describe, expect, it } from 'vitest'
import { deriveCategory, dropTrailingUser, fallbackReply, fetchWithTimeout } from './send-helpers'

describe('deriveCategory', () => {
  it('uses first saved real action', () => {
    expect(deriveCategory([{ type: 'memory', label: 'x' }, { type: 'goal', label: 'g' }, { type: 'note', label: 'n' }])).toBe('goal')
  })
  it('prefers real over connector', () => {
    expect(deriveCategory([{ type: 'connector', label: 'c' }, { type: 'note', label: 'n' }])).toBe('note')
  })
  it('connector only, memory only, empty', () => {
    expect(deriveCategory([{ type: 'connector', label: 'c' }])).toBe('connector')
    expect(deriveCategory([{ type: 'memory', label: 'm' }])).toBe('general')
    expect(deriveCategory([])).toBe('general')
  })
})

describe('dropTrailingUser', () => {
  it('drops identical trailing user message', () => {
    const h = [{ role: 'assistant', text: 'hi' }, { role: 'user', text: 'hello ' }]
    expect(dropTrailingUser(h, 'hello')).toEqual([h[0]])
  })
  it('keeps otherwise', () => {
    const h = [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'hello' }]
    expect(dropTrailingUser(h, 'hello')).toBe(h)
    expect(dropTrailingUser([{ role: 'user', text: 'a' }], 'b')).toHaveLength(1)
  })
})

describe('fallbackReply', () => {
  it('summarizes', () => {
    expect(fallbackReply([{ type: 'note', label: 'Milk' }])).toBe('Done. Saved note "Milk".')
    expect(fallbackReply([{ type: 'memory', label: 'm' }])).toBe('Done.')
    expect(fallbackReply([])).toBe('')
  })
})

describe('fetchWithTimeout', () => {
  it('aborts after timeout', async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch
    await expect(fetchWithTimeout('/x', {}, 20, hang)).rejects.toThrow('too long')
  })
  it('passes through result', async () => {
    const ok = (async () => new Response('ok')) as unknown as typeof fetch
    expect((await fetchWithTimeout('/x', {}, 1000, ok)).status).toBe(200)
  })
})

import { queueTranscript } from './send-helpers'
describe('queueTranscript', () => {
  it('starts and joins', () => {
    expect(queueTranscript(null, ' hello ')).toBe('hello')
    expect(queueTranscript('hello', 'world')).toBe('hello world')
  })
})
