import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EchoResponse } from '@/lib/echo/types'
import type { AiProvider } from '@/lib/echo/connectors'
import { askModelId, resolveAskModel, sealAiKey } from './ask-model'

const SECRET = Buffer.alloc(32, 7).toString('base64')
const ask = (provider: AiProvider, question = 'Is my plan good?'): EchoResponse => ({ reply: 'Let me ask.', actions: [{ type: 'ask_model', provider, question }], memories: [], trace: ['t'] })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.stubEnv('CONNECTOR_SECRET', SECRET)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const keys = (provider: AiProvider, uid = 'u1') => ({ [provider]: sealAiKey(uid, provider, 'sk-test') })
const sentBody = () => JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)

describe('resolveAskModel', () => {
  it('passes a response without ask_model through untouched', async () => {
    const r: EchoResponse = { reply: 'hi', actions: [], memories: [], trace: [] }
    expect(await resolveAskModel(r, { uid: 'u1' })).toBe(r)
  })

  it('asks Claude with the user key and quotes the answer', async () => {
    fetchMock.mockResolvedValue(json({ content: [{ type: 'text', text: 'Yes, mostly.' }] }))
    const out = await resolveAskModel(ask('claude'), { uid: 'u1', aiKeys: keys('claude') })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test')
    expect(sentBody().model).toBe('claude-sonnet-5-5')
    expect(out.reply).toBe('Claude says: Yes, mostly.')
    expect(out.actions).toEqual([])
    expect(out.trace.at(-1)).toBe('Asked Claude')
  })

  it('reads Gemini and OpenAI-style answers', async () => {
    fetchMock.mockResolvedValueOnce(json({ candidates: [{ content: { parts: [{ text: 'Gemini view.' }] } }] }))
    expect((await resolveAskModel(ask('gemini'), { uid: 'u1', aiKeys: keys('gemini') })).reply).toBe('Gemini says: Gemini view.')
    fetchMock.mockResolvedValueOnce(json({ choices: [{ message: { content: 'Groq view.' } }] }))
    const out = await resolveAskModel(ask('groq'), { uid: 'u1', aiKeys: keys('groq') })
    expect(out.reply).toBe('Groq says: Groq view.')
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).model).toBe('openai/gpt-oss-120b')
  })

  it('never uses a key sealed for another account', async () => {
    const out = await resolveAskModel(ask('claude'), { uid: 'u1', aiKeys: keys('claude', 'someone-else') })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.reply).toMatch(/isn't connected yet/)
  })

  it('explains a refused key, a rate limit, a retired model and other failures', async () => {
    const cases: [number, RegExp][] = [
      [401, /turned down your API key/],
      [429, /over your limit/],
      [404, /model Echo asks for isn't available/],
      [500, /couldn't reach Claude/],
    ]
    for (const [status, reply] of cases) {
      fetchMock.mockResolvedValueOnce(json({ error: 'x' }, status))
      expect((await resolveAskModel(ask('claude'), { uid: 'u1', aiKeys: keys('claude') })).reply).toMatch(reply)
    }
  })

  it('says so when the model answers with nothing', async () => {
    fetchMock.mockResolvedValue(json({ choices: [{ message: { content: '  ' } }] }))
    expect((await resolveAskModel(ask('chatgpt'), { uid: 'u1', aiKeys: keys('chatgpt') })).reply).toMatch(/didn't answer/)
  })
})

describe('askModelId', () => {
  it('uses the built-in id unless an env override is set', () => {
    expect(askModelId('groq', {})).toBe('openai/gpt-oss-120b')
    expect(askModelId('chatgpt', { ASK_MODEL_CHATGPT: ' gpt-6-luna ' })).toBe('gpt-6-luna')
    expect(askModelId('openrouter', { ASK_MODEL_OPENROUTER: '' })).toBe('openrouter/auto')
  })
})
