import { describe, expect, it } from 'vitest'
import type { User } from 'firebase/auth'
import { askMemorial, buildVoice } from './legacy-client'
import { FALLBACK_BUBBLE, LEGACY_BODY_MAX_BYTES, type MemorialRequest } from './legacy-prompt'

const user = { getIdToken: async () => 'tok' } as unknown as User
const req: MemorialRequest = { ownerName: 'Peter', inheritorName: 'Ana', voice: null, context: '', history: [], message: 'hi' }

function fake(status: number, body: unknown, seen: { url?: string; auth?: string; body?: string } = {}) {
  return (async (url: string, init: RequestInit) => {
    seen.url = url
    seen.auth = (init.headers as Record<string, string>).Authorization
    seen.body = init.body as string
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
}

describe('askMemorial', () => {
  it('posts with the bearer token and returns sanitized bubbles', async () => {
    const seen: { url?: string; auth?: string } = {}
    expect(await askMemorial(user, req, { fetchImpl: fake(200, { bubbles: ['hi', '', 'HAHAHA'] }, seen) })).toEqual(['hi', 'HAHAHA'])
    expect(seen).toMatchObject({ url: '/api/legacy/chat', auth: 'Bearer tok' })
  })

  it('answers with the fallback bubble when the model failed', async () => {
    expect(await askMemorial(user, req, { fetchImpl: fake(502, { error: 'failed' }) })).toEqual([FALLBACK_BUBBLE])
  })

  it('throws on sign-in and quota errors', async () => {
    await expect(askMemorial(user, req, { fetchImpl: fake(401, {}) })).rejects.toThrow(/sign in/)
    await expect(askMemorial(user, req, { fetchImpl: fake(429, { error: 'quota' }) })).rejects.toThrow(/resting/)
  })

  it('sends at most the last 20 turns, short enough to fit the body limit', async () => {
    const seen: { body?: string } = {}
    const history = Array.from({ length: 30 }, (_, i) => ({ role: 'user' as const, text: `${i} `.padEnd(5000, 'x') }))
    await askMemorial(user, { ...req, history }, { fetchImpl: fake(200, { bubbles: ['ok'] }, seen) })
    const sent = JSON.parse(seen.body!) as MemorialRequest
    expect(sent.history).toHaveLength(20)
    expect(sent.history[19].text.startsWith('29 ')).toBe(true)
    expect(new TextEncoder().encode(seen.body!).length).toBeLessThanOrEqual(LEGACY_BODY_MAX_BYTES)
  })
})

describe('buildVoice', () => {
  it('posts the lines and returns the profile with builtAt', async () => {
    const seen: { url?: string; body?: string } = {}
    const v = await buildVoice(user, ['hala', 'HAHAHA'], 'Peter', { fetchImpl: fake(200, { summary: 'lowercase', samples: ['hala'], nicknames: [], language: 'Taglish', builtAt: 5 }, seen) })
    expect(v).toEqual({ summary: 'lowercase', samples: ['hala'], nicknames: [], language: 'Taglish', builtAt: 5 })
    expect(seen.url).toBe('/api/legacy/voice')
    expect(JSON.parse(seen.body!)).toEqual({ lines: ['hala', 'HAHAHA'], name: 'Peter' })
  })

  it('throws when the route fails', async () => {
    await expect(buildVoice(user, ['x'], 'P', { fetchImpl: fake(502, { error: 'failed' }) })).rejects.toThrow(/unavailable/)
  })
})
