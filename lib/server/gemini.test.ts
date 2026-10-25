import { describe, expect, it } from 'vitest'
import { FallbackError } from './gemini-fallback'
import { DEFAULT_TTS_MODELS, mapGeminiError, ttsModels } from './gemini'

describe('mapGeminiError', () => {
  it('maps an all-429 chain to quota', () => {
    expect(mapGeminiError(new FallbackError([{ status: 429 }, { status: 429 }]))).toEqual({ status: 429, body: { error: 'quota' } })
  })
  it('maps a mixed chain (timeout then 429) to failed', () => {
    expect(mapGeminiError(new FallbackError([{ name: 'AbortError' }, { status: 429 }]))).toEqual({ status: 502, body: { error: 'failed' } })
  })
  it('maps other errors to failed and a bare 429 to quota', () => {
    expect(mapGeminiError({ status: 400 }).status).toBe(502)
    expect(mapGeminiError(null).status).toBe(502)
    expect(mapGeminiError({ status: 429 }).status).toBe(429)
  })
})

describe('ttsModels', () => {
  it('defaults to the chain and accepts a comma override', () => {
    expect(ttsModels(undefined)).toEqual(DEFAULT_TTS_MODELS)
    expect(ttsModels('  ')).toEqual(DEFAULT_TTS_MODELS)
    expect(ttsModels('a, b ,,c')).toEqual(['a', 'b', 'c'])
  })
})
