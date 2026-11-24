import { CONNECTORS, type AiProvider } from '@/lib/echo/connectors'
import type { EchoResponse } from '@/lib/echo/types'
import { open, seal } from './sealed'

// "Ask Claude…": calls another AI model with the user's own API key, sealed per user and provider.
// Never log keys, questions or answers.

const aad = (uid: string, provider: AiProvider) => `ai-key:${uid}:${provider}`
export const sealAiKey = (uid: string, provider: AiProvider, key: string) => seal({ key }, aad(uid, provider))
const openAiKey = (uid: string, provider: AiProvider, sealed: string) => open<{ key?: string }>(sealed, aad(uid, provider))?.key ?? null

// Providers retire models (Groq shut llama-3.3-70b-versatile down on 2026-08-16; OpenAI shuts gpt-4o-mini down on
// 2027-01-14). Each id can be replaced on Vercel with ASK_MODEL_<PROVIDER> (e.g. ASK_MODEL_CHATGPT) without a release.
const MODELS: Record<AiProvider, string> = {
  claude: 'claude-sonnet-5-5',
  gemini: 'gemini-3.5-flash-lite',
  chatgpt: 'gpt-4o-mini',
  perplexity: 'sonar',
  groq: 'openai/gpt-oss-120b',
  openrouter: 'openrouter/auto',
}

/** The model id to ask: the ASK_MODEL_<PROVIDER> env override when set, else the built-in one. */
export function askModelId(provider: AiProvider, env: Record<string, string | undefined> = process.env): string {
  return env[`ASK_MODEL_${provider.toUpperCase()}`]?.trim() || MODELS[provider]
}

const OPENAI_STYLE_URL: Partial<Record<AiProvider, string>> = {
  chatgpt: 'https://api.openai.com/v1/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
}
const SYSTEM = 'Answer in at most 5 short sentences, plainly.'

async function ask(provider: AiProvider, key: string, question: string, signal: AbortSignal): Promise<string> {
  if (provider === 'claude') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: askModelId('claude'), max_tokens: 500, system: SYSTEM, messages: [{ role: 'user', content: question }] }),
      signal,
    })
    if (!r.ok) throw new Error(String(r.status))
    const d = (await r.json()) as { content?: { type?: string; text?: string }[] }
    return (d.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
  }
  if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(askModelId('gemini'))}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: question }] }] }),
      signal,
    })
    if (!r.ok) throw new Error(String(r.status))
    const d = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    return (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  }
  const r = await fetch(OPENAI_STYLE_URL[provider]!, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: askModelId(provider), max_tokens: 500, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: question }] }),
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
    // A retired or renamed model: the fix is a new ASK_MODEL_<PROVIDER> id, not the user's key.
    if (status === '404') return done(`The ${name} model Echo asks for isn't available any more. Please tell the Echo team.`, `${name}: model not found`)
    if (status === '429') return done(`${name} says you're over your limit right now. Try again later.`, `${name}: rate limited`)
    return done(`I couldn't reach ${name} just now. Try again in a moment.`, `${name} failed`)
  }
}
