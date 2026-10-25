export type VoicePrefs = { enabled: boolean; voice: string; autoSpeak: boolean }
export const VOICE_PREFS_KEY = 'echo.voicePrefs'
// autoSpeak is off by default: typed replies are text-only unless the user opts in (calls are always voice).
export const DEFAULT_VOICE_PREFS: VoicePrefs = { enabled: true, voice: 'Kore', autoSpeak: false }

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function loadVoicePrefs(storage: StorageLike | null = defaultStorage()): VoicePrefs {
  if (!storage) return { ...DEFAULT_VOICE_PREFS }
  try {
    const raw = storage.getItem(VOICE_PREFS_KEY)
    if (!raw) return { ...DEFAULT_VOICE_PREFS }
    const p = JSON.parse(raw) as Partial<VoicePrefs> | null
    return {
      enabled: typeof p?.enabled === 'boolean' ? p.enabled : DEFAULT_VOICE_PREFS.enabled,
      voice: typeof p?.voice === 'string' && p.voice ? p.voice : DEFAULT_VOICE_PREFS.voice,
      autoSpeak: typeof p?.autoSpeak === 'boolean' ? p.autoSpeak : DEFAULT_VOICE_PREFS.autoSpeak,
    }
  } catch {
    return { ...DEFAULT_VOICE_PREFS }
  }
}

export function saveVoicePrefs(prefs: VoicePrefs, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(VOICE_PREFS_KEY, JSON.stringify(prefs))
    return true
  } catch {
    return false
  }
}
