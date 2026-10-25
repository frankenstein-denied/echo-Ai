import { describe, expect, it } from 'vitest'
import { isOutside, PTT_INITIAL, pttReduce, type PttEvent, type PttState } from './ptt'

function run(events: PttEvent[]) {
  let state: PttState = PTT_INITIAL
  const effects: unknown[] = []
  for (const e of events) {
    const r = pttReduce(state, e)
    state = r.state
    if (r.effect) effects.push(r.effect)
  }
  return { phase: state.phase, effects }
}

const press: PttEvent = { type: 'press' }
const granted: PttEvent = { type: 'granted' }

describe('ptt reducer', () => {
  it('short press cancels with hint', () => {
    expect(run([press, granted, { type: 'release', elapsedMs: 120 }])).toEqual({ phase: 'idle', effects: ['start', 'discard-hint'] })
  })
  it('normal hold sends then returns to idle', () => {
    expect(run([press, granted, { type: 'release', elapsedMs: 1500 }])).toEqual({ phase: 'sending', effects: ['start', 'send'] })
    expect(run([press, granted, { type: 'release', elapsedMs: 1500 }, { type: 'transcribed' }]).phase).toBe('idle')
    expect(run([press, granted, { type: 'release', elapsedMs: 1500 }, { type: 'failed' }]).phase).toBe('idle')
  })
  it('slide out then release cancels', () => {
    expect(run([press, granted, { type: 'move', inside: false }, { type: 'release', elapsedMs: 2000 }])).toEqual({ phase: 'idle', effects: ['start', 'discard'] })
  })
  it('slide out and back in then release sends', () => {
    const r = run([press, granted, { type: 'move', inside: false }, { type: 'move', inside: true }, { type: 'release', elapsedMs: 2000 }])
    expect(r).toEqual({ phase: 'sending', effects: ['start', 'send'] })
  })
  it('pointercancel / blur cancels while recording and cancelling', () => {
    expect(run([press, granted, { type: 'cancel' }])).toEqual({ phase: 'idle', effects: ['start', 'discard'] })
    expect(run([press, granted, { type: 'move', inside: false }, { type: 'cancel' }]).phase).toBe('idle')
  })
  it('denied permission returns to idle', () => {
    expect(run([press, { type: 'denied' }])).toEqual({ phase: 'idle', effects: ['start', 'denied'] })
  })
  it('60 s timeout sends', () => {
    expect(run([press, granted, { type: 'timeout' }])).toEqual({ phase: 'sending', effects: ['start', 'send'] })
  })
  it('keyboard path uses the same events', () => {
    expect(run([press, granted, { type: 'release', elapsedMs: 800 }]).effects).toEqual(['start', 'send'])
    expect(run([press, granted, { type: 'cancel' }]).effects).toEqual(['start', 'discard'])
  })
  it('release while arming never sends (permission prompt)', () => {
    expect(run([press, { type: 'release', elapsedMs: 0 }]).phase).toBe('arming')
    expect(run([press, { type: 'release', elapsedMs: 5000 }, granted])).toEqual({ phase: 'idle', effects: ['start', 'discard-ready'] })
    expect(run([press, { type: 'cancel' }, granted])).toEqual({ phase: 'idle', effects: ['start', 'discard'] })
    expect(run([press, { type: 'release', elapsedMs: 0 }, { type: 'timeout' }, granted]).effects).toEqual(['start', 'discard-ready'])
  })
  it('hold length counts from grant', () => {
    expect(run([press, granted, { type: 'release', elapsedMs: 250 }]).effects).toEqual(['start', 'discard-hint'])
    expect(run([press, granted, { type: 'release', elapsedMs: 400 }]).effects).toEqual(['start', 'send'])
  })
  it('ignores press while busy and stray events when idle', () => {
    expect(run([press, press, granted, press]).effects).toEqual(['start'])
    expect(run([{ type: 'release', elapsedMs: 1000 }, { type: 'move', inside: false }, { type: 'cancel' }])).toEqual({ phase: 'idle', effects: [] })
  })
})

describe('isOutside', () => {
  const r = { left: 100, right: 140, top: 100, bottom: 140 }
  it('uses a 48px margin', () => {
    expect(isOutside(120, 120, r)).toBe(false)
    expect(isOutside(185, 120, r)).toBe(false)
    expect(isOutside(189, 120, r)).toBe(true)
    expect(isOutside(120, 40, r)).toBe(true)
  })
})
