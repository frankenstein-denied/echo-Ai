// Pure rules for dictation (mic -> WAV -> /api/voice/transcribe -> text). The hook lives in components/echo/use-dictation.ts.
import { INPUT_RATE } from './call-audio'

/** Long recordings stop themselves here (the transcribe route takes at most 60 s). */
export const MAX_DICTATION_MS = 60_000
/** Shorter than this, or never louder than MIN_PEAK, counts as "nothing heard" (no request is made). */
export const MIN_DICTATION_SAMPLES = Math.round(INPUT_RATE * 0.4)
export const MIN_PEAK = 0.01

export const DICTATION_MESSAGES = {
  unsupported: "Voice input isn't available here. You can still type.",
  denied: 'Microphone access is off. Allow it in settings, or type instead.',
  noMic: 'No microphone found. You can still type.',
  busy: 'The microphone is busy in another app. Try again, or type.',
  failed: "Couldn't start the microphone. You can still type.",
  silent: "I didn't hear anything. Try again, or type.",
  empty: "I didn't catch that. Try again, or type.",
} as const

/** Short text for a getUserMedia failure (permission denied, no device, device in use…). */
export function micErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return DICTATION_MESSAGES.denied
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return DICTATION_MESSAGES.noMic
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return DICTATION_MESSAGES.busy
  return DICTATION_MESSAGES.failed
}

/** Whether a recording is worth sending: long enough and louder than silence. */
export function heardSomething(sampleCount: number, peakLevel: number): boolean {
  return sampleCount >= MIN_DICTATION_SAMPLES && peakLevel >= MIN_PEAK
}
