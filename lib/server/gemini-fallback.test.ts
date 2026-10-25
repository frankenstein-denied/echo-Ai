import { describe, expect, it } from 'vitest'
import { geminiModels, isRetryable, withModelFallback } from './gemini-fallback'

describe('geminiModels', () => {
  it('defaults to the fast Flash-Lite chain', () => {
    expect(geminiModels(undefined)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])
  })
  it('accepts a comma-separated override', () => {
    expect(geminiModels(' a , b,,c ')).toEqual(['a', 'b', 'c'])
  })
})

describe('isRetryable', () => {
  it('retries quota, overload, server errors, timeouts and bad JSON', () => {
    expect(isRetryable({ status: 429 })).toBe(true)
    expect(isRetryable({ status: 503 })).toBe(true)
    expect(isRetryable({ status: 500 })).toBe(true)
    expect(isRetryable({ name: 'AbortError' })).toBe(true)
    expect(isRetryable(new SyntaxError('bad json'))).toBe(true)
  })
  it('does not retry client errors', () => {
    expect(isRetryable({ status: 400 })).toBe(false)
    expect(isRetryable({ status: 403 })).toBe(false)
  })
})

describe('withModelFallback', () => {
  it('returns the first model that succeeds', async () => {
    const tried: string[] = []
    const out = await withModelFallback(['m1', 'm2'], 1000, async (model) => {
      tried.push(model)
      if (model === 'm1') throw { status: 429 }
      return 'ok'
    })
    expect(out).toEqual({ value: 'ok', model: 'm2' })
    expect(tried).toEqual(['m1', 'm2'])
  })
  it('moves on when a model is slower than the per-attempt timeout', async () => {
    const out = await withModelFallback(['slow', 'fast'], 30, async (model, signal) => {
      if (model === 'slow') {
        await new Promise((_, reject) => signal.addEventListener('abort', () => reject({ name: 'AbortError' })))
      }
      return model
    })
    expect(out.model).toBe('fast')
  })
  it('stops on a non-retryable error', async () => {
    await expect(withModelFallback(['m1', 'm2'], 1000, async () => { throw { status: 400 } })).rejects.toEqual({ status: 400 })
  })
  it('throws the last error when every model fails', async () => {
    await expect(withModelFallback(['m1', 'm2'], 1000, async (m) => { throw { status: 503, m } })).rejects.toMatchObject({ status: 503, allQuota: false, attempts: [{ status: 503, m: 'm1' }, { status: 503, m: 'm2' }] })
  })
  it('flags allQuota only when every attempt was a 429', async () => {
    await expect(withModelFallback(['m1', 'm2'], 1000, async () => { throw { status: 429 } })).rejects.toMatchObject({ status: 429, allQuota: true })
    await expect(
      withModelFallback(['m1', 'm2'], 1000, async (m) => { throw m === 'm1' ? { name: 'AbortError' } : { status: 429 } }),
    ).rejects.toMatchObject({ status: 429, allQuota: false })
  })
})
