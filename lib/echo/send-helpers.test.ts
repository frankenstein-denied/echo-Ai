import { describe, expect, it } from 'vitest'
import { deriveCategory, dropTrailingUser, fallbackReply, fetchWithTimeout, readEchoResponse } from './send-helpers'

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

describe('readEchoResponse', () => {
  it('keeps the web search fields the browser needs', () => {
    const r = readEchoResponse({
      reply: 'Hi',
      actions: [],
      memories: [],
      trace: ['Searched the web'],
      sources: [{ title: 'Apple', url: 'https://apple.com' }, { title: 7, url: 'x' }, 'junk'],
      webSearchResealed: 'sealed-2',
      webSearchRevoked: true,
    })
    expect(r).toEqual({ reply: 'Hi', actions: [], memories: [], trace: ['Searched the web'], sources: [{ title: 'Apple', url: 'https://apple.com' }], webSearchResealed: 'sealed-2', webSearchRevoked: true })
  })

  it('fills defaults and omits absent optional fields', () => {
    expect(readEchoResponse({ error: true })).toEqual({ reply: '', actions: [], memories: [], trace: [], error: true })
    expect(readEchoResponse(null)).toEqual({ reply: '', actions: [], memories: [], trace: [] })
  })
})
