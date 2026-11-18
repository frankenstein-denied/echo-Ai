import { CONNECTORS, type AiProvider } from '@/lib/echo/connectors'
import type { EchoResponse } from '@/lib/echo/types'
import { open, seal } from './sealed'

// "Ask Claude…": calls another AI model with the user's own API key, sealed per user and provider.
// Never log keys, questions or answers.

const aad = (uid: string, provider: AiProvider) => `ai-key:${uid}:${provider}`
export const sealAiKey = (uid: string, provider: AiProvider, key: string) => seal({ key }, aad(uid, provider))
const openAiKey = (uid: string, provider: AiProvider, sealed: string) => open<{ key?: string }>(sealed, aad(uid, provider))?.key ?? null

const OPENAI_STYLE: Partial<Record<AiProvider, { url: string; model: string }>> = {
  chatgpt: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  perplexity: { url: 'https://api.perplexity.ai/chat/completions', model: 'sonar' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openrouter/auto' },
}
const SYSTEM = 'Answer in at most 5 short sentences, plainly.'

async function ask(provider: AiProvider, key: string, question: string, signal: AbortSignal): Promise<string> {
  if (provider === 'claude') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 500, system: SYSTEM, messages: [{ role: 'user', content: question }] }),
      signal,
    })
    if (!r.ok) throw new Error(String(r.status))
    const d = (await r.json()) as { content?: { type?: string; text?: string }[] }
    return (d.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
  }
  if (provider === 'gemini') {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: question }] }] }),
      signal,
    })
    if (!r.ok) throw new Error(String(r.status))
    const d = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    return (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  }
  const cfg = OPENAI_STYLE[provider]!
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: cfg.model, max_tokens: 500, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: question }] }),
    signal,
  })
  if (!r.ok) throw new Error(String(r.status))
  const d = (await r.json()) as { choices?: { message?: { content?: string } }[] }
  return d.choices?.[0]?.message?.content ?? ''
}

const nameOf = (p: AiProvider) => CONNECTORS.find((c) => c.id === p)?.name.replace(/ \(.*\)$/, '') ?? p

/** Replaces an ask_model action with the other model's answer (or why it couldn't ask). */
export async function resolveAskModel(res: EchoResponse, deps: { uid: string; aiKeys?: Partial<Record<AiProvider, string>>; deadline?: number }): Promise<EchoResponse> {
  const action = res.actions.find((a) => a.type === 'ask_model')
  if (!action) return res
  const rest = res.actions.filter((a) => a.type !== 'ask_model')
  const name = nameOf(action.provider)
  const done = (reply: string, trace: string): EchoResponse => ({ ...res, actions: rest, reply: reply.slice(0, 1500), trace: [...res.trace, trace].slice(-8) })
  const sealed = deps.aiKeys?.[action.provider]
  const key = sealed ? openAiKey(deps.uid, action.provider, sealed) : null
  if (!key) return done(`${name} isn't connected yet. Add your ${name} API key in Connectors, under AI models, and ask me again.`, `${name}: no key`)
  try {
    const left = (deps.deadline ?? Date.now() + 20000) - Date.now()
    const answer = (await ask(action.provider, key, action.question, AbortSignal.timeout(Math.max(3000, Math.min(20000, left))))).trim()
    if (!answer) return done(`${name} didn't answer. Try again in a moment.`, `${name}: empty`)
    return done(`${name} says: ${answer}`, `Asked ${name}`)
  } catch (err) {
    const status = (err as Error)?.message
    console.warn(`[echo] ask ${action.provider} failed:`, status)
    if (status === '401' || status === '403') return done(`${name} turned down your API key. Check it in Connectors.`, `${name}: key refused`)
    if (status === '429') return done(`${name} says you're over your limit right now. Try again later.`, `${name}: rate limited`)
    return done(`I couldn't reach ${name} just now. Try again in a moment.`, `${name} failed`)
  }
}
