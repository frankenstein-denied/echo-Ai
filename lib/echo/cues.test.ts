import { describe, expect, it } from 'vitest'
import { CUES, cueForSaved, DEFAULT_SOUND_PREFS, loadSoundPrefs, newlyDone, saveSoundPrefs, SOUND_PREFS_KEY } from './cues'

function memoryStorage(init: Record<string, string> = {}) {
  const data = { ...init }
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data }
}

describe('cueForSaved', () => {
  it('is a plain reply when nothing was saved', () => {
    expect(cueForSaved([])).toBe('reply')
  })
  it('stays a plain reply for 2nd Brain memories, which are quiet bookkeeping', () => {
    expect(cueForSaved([{ type: 'memory', label: 'Mama' }])).toBe('reply')
  })
  it('is the saved chime for a note, reminder, health log or meal', () => {
    for (const type of ['note', 'reminder', 'health', 'meal'] as const) expect(cueForSaved([{ type, label: 'x' }])).toBe('saved')
  })
  it('is the goal chime when a goal was added or moved forward, over anything else', () => {
    expect(cueForSaved([{ type: 'note', label: 'x' }, { type: 'goal', label: 'Run 5k', op: 'update' }])).toBe('goal')
    expect(cueForSaved([{ type: 'goal', label: 'Run 5k' }])).toBe('goal')
  })
  it('never celebrates a delete', () => {
    expect(cueForSaved([{ type: 'goal', label: 'Run 5k', op: 'delete' }])).toBe('reply')
    expect(cueForSaved([{ type: 'note', label: 'x', op: 'delete' }])).toBe('reply')
  })
})

describe('newlyDone', () => {
  it('is true only when a milestone went from open to done', () => {
    const before = [{ text: 'a', done: false }, { text: 'b', done: true }]
    expect(newlyDone(before, [{ text: 'a', done: true }, { text: 'b', done: true }])).toBe(true)
    expect(newlyDone(before, [{ text: 'a', done: false }, { text: 'b', done: false }])).toBe(false)
    expect(newlyDone(before, before)).toBe(false)
  })
})

describe('CUES', () => {
  it('rises, like a friend saying "hey!", and grows with what happened', () => {
    expect(CUES.reply.notes).toHaveLength(1)
    expect(CUES.saved.notes).toHaveLength(2)
    expect(CUES.goal.notes).toHaveLength(3)
    for (const cue of Object.values(CUES)) {
      for (let i = 1; i < cue.notes.length; i++) {
        expect(cue.notes[i].freq).toBeGreaterThan(cue.notes[i - 1].freq)
        expect(cue.notes[i].at).toBeGreaterThan(cue.notes[i - 1].at)
      }
    }
  })
  it('keeps the plain reply quiet: no vibration, softest sound', () => {
    expect(CUES.reply.vibrate).toEqual([])
    expect(CUES.reply.gain).toBeLessThan(CUES.saved.gain)
  })
})

describe('sound prefs', () => {
  it('are on by default', () => {
    expect(loadSoundPrefs(memoryStorage())).toEqual(DEFAULT_SOUND_PREFS)
    expect(DEFAULT_SOUND_PREFS.enabled).toBe(true)
  })
  it('round-trip and survive bad data', () => {
    const s = memoryStorage()
    expect(saveSoundPrefs({ enabled: false }, s)).toBe(true)
    expect(loadSoundPrefs(s)).toEqual({ enabled: false })
    expect(loadSoundPrefs(memoryStorage({ [SOUND_PREFS_KEY]: '{oops' }))).toEqual(DEFAULT_SOUND_PREFS)
    expect(loadSoundPrefs(null)).toEqual(DEFAULT_SOUND_PREFS)
  })
})
