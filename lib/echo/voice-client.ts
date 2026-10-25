import type { User } from 'firebase/auth'

export type VoiceErrorKind = 'quota' | 'unauthorized' | 'failed'
export class VoiceError extends Error {
  constructor(
    public kind: VoiceErrorKind,
    message?: string,
    public status?: number,
  ) {
    super(message ?? kind)
    this.name = 'VoiceError'
  }
}

export function voiceErrorFromStatus(status: number, body?: { error?: unknown } | null): VoiceError {
  if (status === 401) return new VoiceError('unauthorized', 'Please sign in again.', status)
  if (status === 429 || body?.error === 'quota') return new VoiceError('quota', "Echo's voice reached today's free limit.", status)
  return new VoiceError('failed', 'Voice is unavailable right now.', status)
}

type Tok = Pick<User, 'getIdToken'>
export type VoiceOpts = { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number }

async function call(user: Tok, path: string, init: RequestInit, opts: VoiceOpts, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? ms)
  try {
    const token = await user.getIdToken()
    const res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl ?? ''}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      let body: { error?: unknown } | null = null
      try {
        body = await res.json()
      } catch {}
      throw voiceErrorFromStatus(res.status, body)
    }
    return res
  } catch (e) {
    if (e instanceof VoiceError) throw e
    throw new VoiceError('failed', ctrl.signal.aborted ? 'Voice took too long.' : 'Voice is unavailable right now.')
  } finally {
    clearTimeout(timer)
  }
}

export async function transcribe(user: Tok, wav: Blob, opts: VoiceOpts = {}): Promise<string> {
  const form = new FormData()
  form.append('audio', wav, 'audio.wav')
  const res = await call(user, '/api/voice/transcribe', { method: 'POST', body: form }, opts, 25000)
  const data = (await res.json().catch(() => ({}))) as { text?: unknown }
  return typeof data.text === 'string' ? data.text.trim() : ''
}

export async function speakBlob(user: Tok, text: string, voice: string, opts: VoiceOpts = {}): Promise<Blob> {
  const res = await call(
    user,
    '/api/voice/speak',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 1000), voice }) },
    opts,
    30000,
  )
  return res.blob()
}

// Returns an unplayed audio element; its object URL is revoked when playback ends or errors.
export async function speak(user: Tok, text: string, voice: string, opts: VoiceOpts = {}): Promise<HTMLAudioElement> {
  const blob = await speakBlob(user, text, voice, opts)
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  const revoke = () => URL.revokeObjectURL(url)
  audio.addEventListener('ended', revoke, { once: true })
  audio.addEventListener('error', revoke, { once: true })
  audio.addEventListener('pause', revoke, { once: true }) // stop button
  return audio
}

export type VoiceOption = { id: string; label: string }
export async function listVoices(user: Tok, opts: VoiceOpts = {}): Promise<{ voices: VoiceOption[]; default: string }> {
  const res = await call(user, '/api/voice/voices', { method: 'GET' }, opts, 15000)
  const d = (await res.json().catch(() => ({}))) as { voices?: VoiceOption[]; default?: string }
  return { voices: Array.isArray(d.voices) ? d.voices : [], default: d.default ?? 'Kore' }
}
