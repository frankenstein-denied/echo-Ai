/**
 * Echo's sound identity in the app: soft, bell-like rising notes (the same as the Android check-in chime,
 * scripts/make-chime.mjs) and light taps, so a reply feels like a friend answering, not an app pinging.
 */

export type CueKind = 'reply' | 'saved' | 'goal'
export type CueNote = { freq: number; at: number }
export type Cue = { notes: CueNote[]; gain: number; decay: number; vibrate: number[] }

const A4 = 440
const E5 = 659.25
const A5 = 880

export const CUES: Record<CueKind, Cue> = {
  // A single soft note: Echo answered.
  reply: { notes: [{ freq: E5, at: 0 }], gain: 0.05, decay: 0.18, vibrate: [] },
  // The "hey!" chime: Echo saved something for you.
  saved: { notes: [{ freq: A4, at: 0 }, { freq: E5, at: 0.11 }], gain: 0.08, decay: 0.28, vibrate: [12, 70, 18] },
  // One step higher: a goal moved forward.
  goal: { notes: [{ freq: A4, at: 0 }, { freq: E5, at: 0.1 }, { freq: A5, at: 0.2 }], gain: 0.09, decay: 0.32, vibrate: [14, 60, 14, 60, 28] },
}

/** A warm bell: the fundamental, a soft octave and a faint fifth above it. */
const PARTIALS: [number, number][] = [
  [1, 1],
  [2.01, 0.25],
  [3, 0.08],
]
const ATTACK = 0.006

type SavedLike = { type: string; label: string; op?: 'update' | 'delete' }

/** The cue for a reply from what it saved. 2nd Brain memories are quiet bookkeeping, and deletes are never celebrated. */
export function cueForSaved(saved: SavedLike[]): CueKind {
  const kept = saved.filter((s) => s.op !== 'delete' && s.type !== 'memory')
  if (kept.some((s) => s.type === 'goal')) return 'goal'
  return kept.length ? 'saved' : 'reply'
}

/** True when a milestone went from open to done. */
export function newlyDone<T extends { done: boolean }>(before: T[], after: T[]): boolean {
  return after.some((m, i) => m.done && !before[i]?.done)
}

// ---------- preference (per device: a phone on the desk and a laptop in a meeting differ) ----------

export type SoundPrefs = { enabled: boolean }
export const SOUND_PREFS_KEY = 'echo.soundPrefs'
export const DEFAULT_SOUND_PREFS: SoundPrefs = { enabled: true }

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function loadSoundPrefs(storage: StorageLike | null = defaultStorage()): SoundPrefs {
  if (!storage) return { ...DEFAULT_SOUND_PREFS }
  try {
    const p = JSON.parse(storage.getItem(SOUND_PREFS_KEY) ?? 'null') as Partial<SoundPrefs> | null
    return { enabled: typeof p?.enabled === 'boolean' ? p.enabled : DEFAULT_SOUND_PREFS.enabled }
  } catch {
    return { ...DEFAULT_SOUND_PREFS }
  }
}

export function saveSoundPrefs(prefs: SoundPrefs, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(SOUND_PREFS_KEY, JSON.stringify(prefs))
    return true
  } catch {
    return false
  }
}

// ---------- playback ----------

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx || ctx.state === 'closed') {
      const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      ctx = new Ctx()
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    return ctx
  } catch {
    return null
  }
}

/**
 * Plays a cue when sounds are on and the page is in view. Never throws: a cue must never get in the way of
 * the reply. `force` plays it even when off (the Settings preview).
 */
export function playCue(kind: CueKind, opts: { force?: boolean } = {}): void {
  try {
    if (!opts.force && !loadSoundPrefs().enabled) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const cue = CUES[kind]
    if (cue.vibrate.length && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(cue.vibrate)
    const ac = audio()
    if (!ac) return
    const out = ac.createGain()
    out.gain.value = cue.gain
    out.connect(ac.destination)
    const t0 = ac.currentTime + 0.02
    const end = t0 + cue.notes[cue.notes.length - 1].at + cue.decay * 5
    for (const note of cue.notes) {
      const start = t0 + note.at
      const env = ac.createGain()
      env.gain.setValueAtTime(0, start)
      env.gain.linearRampToValueAtTime(1, start + ATTACK)
      env.gain.setTargetAtTime(0, start + ATTACK, cue.decay)
      env.connect(out)
      for (const [mult, amp] of PARTIALS) {
        const osc = ac.createOscillator()
        const g = ac.createGain()
        osc.frequency.value = note.freq * mult
        g.gain.value = amp
        osc.connect(g).connect(env)
        osc.start(start)
        osc.stop(end)
      }
    }
    setTimeout(() => out.disconnect(), (end - ac.currentTime) * 1000 + 100)
  } catch {
    // Sound is a nicety; ignore any failure.
  }
}
