// Push-to-talk gesture state machine (pure). The component feeds it events and runs the returned effect.
export const MIN_HOLD_MS = 300
export const CANCEL_DISTANCE_PX = 48

export type PttPhase = 'idle' | 'arming' | 'recording' | 'cancelling' | 'sending'

export type PttState = {
  phase: PttPhase
  // Release/cancel that happened while the mic was still being acquired; resolved on `granted`.
  early: null | { kind: 'release'; elapsedMs: number } | { kind: 'cancel' }
}

export type PttEvent =
  | { type: 'press' }
  | { type: 'granted' }
  | { type: 'denied' }
  | { type: 'move'; inside: boolean }
  | { type: 'release'; elapsedMs: number } // elapsedMs = time since recording actually started (grant)
  | { type: 'cancel' }
  | { type: 'transcribed' }
  | { type: 'failed' }
  | { type: 'timeout' }

export type PttEffect = 'start' | 'send' | 'discard' | 'discard-hint' | 'discard-ready' | 'denied' | null

export const PTT_INITIAL: PttState = { phase: 'idle', early: null }

const idle = (effect: PttEffect): { state: PttState; effect: PttEffect } => ({ state: PTT_INITIAL, effect })

export function pttReduce(s: PttState, e: PttEvent): { state: PttState; effect: PttEffect } {
  const same = { state: s, effect: null as PttEffect }
  switch (e.type) {
    case 'press':
      return s.phase === 'idle' ? { state: { phase: 'arming', early: null }, effect: 'start' } : same
    case 'granted':
      if (s.phase !== 'arming') return same
      if (!s.early) return { state: { phase: 'recording', early: null }, effect: null }
      if (s.early.kind === 'cancel') return idle('discard')
      // Released while waiting for permission/mic: never send; the user did not actually speak.
      return idle('discard-ready')
    case 'denied':
      return s.phase === 'arming' ? idle('denied') : same
    case 'move':
      if (s.phase === 'recording' && !e.inside) return { state: { phase: 'cancelling', early: null }, effect: null }
      if (s.phase === 'cancelling' && e.inside) return { state: { phase: 'recording', early: null }, effect: null }
      return same
    case 'release':
      if (s.phase === 'arming') return { state: { phase: 'arming', early: { kind: 'release', elapsedMs: e.elapsedMs } }, effect: null }
      if (s.phase === 'cancelling') return idle('discard')
      if (s.phase === 'recording') return e.elapsedMs < MIN_HOLD_MS ? idle('discard-hint') : { state: { phase: 'sending', early: null }, effect: 'send' }
      return same
    case 'cancel':
      if (s.phase === 'arming') return { state: { phase: 'arming', early: { kind: 'cancel' } }, effect: null }
      if (s.phase === 'recording' || s.phase === 'cancelling') return idle('discard')
      return same
    case 'timeout':
      if (s.phase === 'recording') return { state: { phase: 'sending', early: null }, effect: 'send' }
      if (s.phase === 'cancelling') return idle('discard')
      return same
    case 'transcribed':
    case 'failed':
      return s.phase === 'sending' ? idle(null) : same
  }
}

// True when the pointer is more than `margin` px outside the rect.
export function isOutside(x: number, y: number, r: { left: number; right: number; top: number; bottom: number }, margin = CANCEL_DISTANCE_PX): boolean {
  return x < r.left - margin || x > r.right + margin || y < r.top - margin || y > r.bottom + margin
}
