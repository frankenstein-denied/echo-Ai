import { describe, expect, it } from 'vitest'
import { DEFAULT_VOICE_PREFS, loadVoicePrefs, saveVoicePrefs, VOICE_PREFS_KEY } from './voice-prefs'

const fake = (init: Record<string, string> = {}) => {
  const m = { ...init }
  return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => void (m[k] = v) }
}

describe('voice prefs', () => {
  it('defaults with no storage (SSR)', () => {
    expect(loadVoicePrefs(null)).toEqual(DEFAULT_VOICE_PREFS)
    expect(loadVoicePrefs()).toEqual(DEFAULT_VOICE_PREFS) // node: no window
    expect(saveVoicePrefs(DEFAULT_VOICE_PREFS, null)).toBe(false)
  })
  it('round-trips', () => {
    const s = fake()
    expect(saveVoicePrefs({ enabled: false, voice: 'Puck', autoSpeak: false }, s)).toBe(true)
    expect(loadVoicePrefs(s)).toEqual({ enabled: false, voice: 'Puck', autoSpeak: false })
  })
  it('falls back on corrupt or partial data', () => {
    expect(loadVoicePrefs(fake({ [VOICE_PREFS_KEY]: '{bad' }))).toEqual(DEFAULT_VOICE_PREFS)
    expect(loadVoicePrefs(fake({ [VOICE_PREFS_KEY]: '{"voice":"Leda","enabled":"x"}' }))).toEqual({ ...DEFAULT_VOICE_PREFS, voice: 'Leda' })
  })
  it('swallows storage errors', () => {
    const bad = {
      getItem: () => {
        throw new Error('x')
      },
      setItem: () => {
        throw new Error('x')
      },
    }
    expect(loadVoicePrefs(bad)).toEqual(DEFAULT_VOICE_PREFS)
    expect(saveVoicePrefs(DEFAULT_VOICE_PREFS, bad)).toBe(false)
  })
})
