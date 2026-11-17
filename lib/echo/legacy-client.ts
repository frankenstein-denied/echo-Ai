import type { User } from 'firebase/auth'
import { FALLBACK_BUBBLE, fitVoiceLines, LEGACY_BODY_MAX_BYTES, sanitizeBubbles, sanitizeVoice, type MemorialRequest, type VoiceProfile } from './legacy-prompt'
import { fetchWithTimeout } from './send-helpers'

// Fetch wrappers for the Legacy routes, authed like sendToEcho. Both routes allow 30 s.
const TIMEOUT_MS = 32000
const HISTORY_MAX = 20
const HISTORY_TEXT_MAX = 1000

type Opts = { fetchImpl?: typeof fetch }

async function post(user: Pick<User, 'getIdToken'>, url: string, body: string, opts: Opts): Promise<Response> {
  const token = await user.getIdToken()
  return fetchWithTimeout(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body },
    TIMEOUT_MS,
    opts.fetchImpl,
  )
}

/** The last 20 turns, each clipped, dropping the oldest until the body fits the routes' limit. */
function memorialBody(req: MemorialRequest): string {
  let history = req.history.slice(-HISTORY_MAX).map((t) => ({ role: t.role, text: t.text.slice(0, HISTORY_TEXT_MAX) }))
  let body = JSON.stringify({ ...req, history })
  while (history.length && new TextEncoder().encode(body).length > LEGACY_BODY_MAX_BYTES) {
    history = history.slice(1)
    body = JSON.stringify({ ...req, history })
  }
  return body
}

function failure(status: number): Error {
  if (status === 401) return new Error('Please sign in again.')
  if (status === 429) return new Error('Echo is resting for a bit. Try again later.')
  return new Error(`Echo is unavailable (${status}).`)
}

/** Builds the owner's voice profile from their own typed lines (oldest first). Throws on failure. */
export async function buildVoice(user: User, lines: string[], name: string, opts: Opts = {}): Promise<VoiceProfile> {
  const res = await post(user, '/api/legacy/voice', JSON.stringify({ lines: fitVoiceLines(lines), name }), opts)
  if (!res.ok) throw failure(res.status)
  const raw = (await res.json()) as Record<string, unknown>
  const voice = sanitizeVoice(raw)
  return typeof raw.builtAt === 'number' ? { ...voice, builtAt: raw.builtAt } : voice
}

/**
 * The memorial's reply bubbles. When the model could not answer (502), resolves with the in-character
 * fallback bubble; sign-in, quota and request errors throw.
 */
export async function askMemorial(user: User, req: MemorialRequest, opts: Opts = {}): Promise<string[]> {
  const res = await post(user, '/api/legacy/chat', memorialBody(req), opts)
  if (res.status === 502) return [FALLBACK_BUBBLE]
  if (!res.ok) throw failure(res.status)
  return sanitizeBubbles(await res.json())
}
