'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { Loader2, Mic, MicOff } from 'lucide-react'
import { MAX_RECORD_SECONDS, WavRecorder } from '@/lib/echo/wav-recorder'
import { transcribe, VoiceError } from '@/lib/echo/voice-client'
import { isOutside, PTT_INITIAL, pttReduce, type PttEffect, type PttEvent, type PttPhase, type PttState } from '@/lib/echo/ptt'

export type MicState = 'idle' | 'recording' | 'transcribing'

function micMessage(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access was blocked. Allow it in your browser settings to talk to Echo.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found.'
  if (e instanceof VoiceError) return e.message
  return 'Could not use the microphone.'
}

const BAR_SCALE = [0.6, 0.9, 1, 0.8, 0.55]

export function MicButton({
  user,
  disabled, // blocks starting only; never blocks releasing/sending
  onTranscript,
  onEmpty,
  onStateChange,
  onQuota,
}: {
  user: User
  disabled?: boolean
  onTranscript: (text: string) => void
  onEmpty: () => void
  onStateChange?: (s: MicState) => void
  onQuota?: () => void
}) {
  const [phase, setPhase] = useState<PttPhase>('idle')
  const [secs, setSecs] = useState(0)
  const [level, setLevel] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [shortHint, setShortHint] = useState<null | 'hold' | 'ready'>(null)
  const machine = useRef<PttState>(PTT_INITIAL)
  const rec = useRef<WavRecorder | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const grantedAt = useRef(0)
  const descId = useId()
  const pointerId = useRef<number | null>(null)
  const keyHeld = useRef(false)
  const zone = useRef<HTMLSpanElement | null>(null)
  const cb = useRef({ onTranscript, onEmpty, onQuota, change: onStateChange, disabled, user })
  useEffect(() => {
    cb.current = { onTranscript, onEmpty, onQuota, change: onStateChange, disabled, user }
  })
  const dispatchRef = useRef<(e: PttEvent) => void>(() => undefined)

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  const discard = useCallback(() => {
    clearTimer()
    ;(rec.current as WavRecorder | null)?.cancel()
    rec.current = null
    setLevel(0)
    setSecs(0)
  }, [])

  const send = useCallback(async () => {
    const r = rec.current
    rec.current = null
    clearTimer()
    setLevel(0)
    if (!r) {
      dispatchRef.current({ type: 'failed' })
      return
    }
    try {
      const wav = await r.stop()
      // Silent recordings make the model hallucinate text; skip the call.
      const text = r.silent ? '' : await transcribe(cb.current.user, wav)
      if (!mounted.current) return
      dispatchRef.current({ type: 'transcribed' })
      if (text) cb.current.onTranscript(text)
      else cb.current.onEmpty()
    } catch (e) {
      if (!mounted.current) return
      if (e instanceof VoiceError && e.kind === 'quota') cb.current.onQuota?.() // Home shows the single notice
      else setMessage(micMessage(e))
      dispatchRef.current({ type: 'failed' })
    }
  }, [])

  const begin = useCallback(async () => {
    const r = new WavRecorder()
    try {
      await r.start()
    } catch (e) {
      if (mounted.current) {
        setMessage(micMessage(e))
        dispatchRef.current({ type: 'denied' })
      }
      return
    }
    if (!mounted.current) {
      r.cancel()
      return
    }
    ;(rec.current as WavRecorder | null)?.cancel()
    clearTimer()
    rec.current = r
    setSecs(0)
    grantedAt.current = Date.now()
    dispatchRef.current({ type: 'granted' })
    if (machine.current.phase === 'recording' && rec.current === r) {
      const t0 = Date.now()
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000)
        setSecs(s)
        setLevel(r.level)
        if (s >= MAX_RECORD_SECONDS) dispatchRef.current({ type: 'timeout' })
      }, 80)
    }
  }, [])

  const dispatch = useCallback(
    (e: PttEvent) => {
      const prev = machine.current.phase
      const r = pttReduce(machine.current, e)
      machine.current = r.state
      const next = r.state.phase
      setPhase(next)
      if (next !== prev) {
        const ms: MicState = next === 'recording' || next === 'cancelling' ? 'recording' : next === 'sending' ? 'transcribing' : 'idle'
        const pms: MicState = prev === 'recording' || prev === 'cancelling' ? 'recording' : prev === 'sending' ? 'transcribing' : 'idle'
        if (ms !== pms) cb.current.change?.(ms)
      }
      // Leaving the held phases (external cancel, timeout, sending) forgets held input,
      // so a dropped pointerup/keyup can never strand the button.
      if (next === 'idle' || next === 'sending') {
        pointerId.current = null
        keyHeld.current = false
      }
      const effect: PttEffect = r.effect
      if (effect === 'start') {
        setMessage(null)
        setShortHint(null)
        void begin()
      } else if (effect === 'send') void send()
      else if (effect === 'discard' || effect === 'discard-hint' || effect === 'discard-ready') {
        discard()
        if (effect !== 'discard') {
          setShortHint(effect === 'discard-ready' ? 'ready' : 'hold')
          if (hintTimer.current) clearTimeout(hintTimer.current)
          hintTimer.current = setTimeout(() => setShortHint(null), 2000)
        }
      }
    },
    [begin, send, discard],
  )
  useEffect(() => {
    dispatchRef.current = dispatch
  }, [dispatch])

  useEffect(() => {
    mounted.current = true
    const abort = () => dispatchRef.current({ type: 'cancel' })
    const vis = () => {
      if (document.hidden) abort()
    }
    window.addEventListener('blur', abort)
    document.addEventListener('visibilitychange', vis)
    return () => {
      mounted.current = false
      window.removeEventListener('blur', abort)
      document.removeEventListener('visibilitychange', vis)
      clearTimer()
      if (hintTimer.current) clearTimeout(hintTimer.current)
      ;(rec.current as WavRecorder | null)?.cancel()
      rec.current = null
    }
  }, [])

  const heldMs = () => (grantedAt.current ? Date.now() - grantedAt.current : 0)

  const press = () => {
    if (cb.current.disabled || machine.current.phase !== 'idle') return false
    grantedAt.current = 0
    dispatch({ type: 'press' })
    return true
  }

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (pointerId.current !== null || keyHeld.current) return
    e.preventDefault()
    if (!press()) return
    e.currentTarget.focus()
    pointerId.current = e.pointerId
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
  }
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== pointerId.current || !zone.current) return
    dispatch({ type: 'move', inside: !isOutside(e.clientX, e.clientY, zone.current.getBoundingClientRect()) })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== pointerId.current) return
    pointerId.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    dispatch({ type: 'release', elapsedMs: heldMs() })
  }
  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== pointerId.current) return
    pointerId.current = null
    dispatch({ type: 'cancel' })
  }

  const onLostPointerCapture = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== pointerId.current) return
    pointerId.current = null
    dispatch({ type: 'cancel' })
  }

  const isPttKey = (k: string) => k === ' ' || k === 'Enter' || k === 'Spacebar'
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      if (keyHeld.current || pointerId.current !== null) {
        keyHeld.current = false
        pointerId.current = null
        dispatch({ type: 'cancel' })
      }
      return
    }
    if (!isPttKey(e.key)) return
    e.preventDefault()
    if (e.repeat || keyHeld.current || pointerId.current !== null) return
    if (press()) keyHeld.current = true
  }
  const onKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isPttKey(e.key)) return
    e.preventDefault()
    if (!keyHeld.current) return
    keyHeld.current = false
    dispatch({ type: 'release', elapsedMs: heldMs() })
  }
  const onBlur = () => {
    if (keyHeld.current) {
      keyHeld.current = false
      dispatch({ type: 'cancel' })
    }
  }

  const holding = phase === 'recording' || phase === 'cancelling'
  const cancelling = phase === 'cancelling'
  const arming = phase === 'arming'
  const sending = phase === 'sending'
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const helper = cancelling ? 'Release to cancel' : holding ? 'Release to send · slide away to cancel' : shortHint === 'ready' ? 'Mic ready — hold to talk' : shortHint === 'hold' ? 'Hold to talk' : null
  const tone = cancelling ? 'bg-danger text-foreground' : holding ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground hover:text-foreground'

  return (
    <div className="relative flex items-center gap-2">
      {holding && (
        <>
          <span className={`text-xs tabular-nums ${cancelling ? 'text-danger' : 'text-muted-foreground'}`}>{mm}</span>
          <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
            {BAR_SCALE.map((m, i) => (
              <span
                key={i}
                className={`w-1 rounded-full motion-safe:transition-[height] motion-safe:duration-100 ${cancelling ? 'bg-danger' : 'bg-primary'}`}
                style={{ height: `${Math.round(4 + Math.min(1, level * m) * 16)}px` }}
              />
            ))}
          </span>
        </>
      )}
      <span ref={zone} className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center">
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onLostPointerCapture}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={onBlur}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => e.preventDefault()}
          disabled={phase === 'idle' && !!disabled}
          aria-disabled={sending || undefined}
          aria-describedby={descId}
          aria-label="Hold to talk"
          title={holding ? undefined : 'Hold to talk'}
          style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
          className={`flex h-10 w-10 select-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 motion-safe:transition-transform ${holding ? 'motion-safe:scale-[1.15]' : ''} ${tone}`}
        >
          {sending || arming ? <Loader2 size={18} aria-hidden="true" className="motion-safe:animate-spin" /> : disabled && phase === 'idle' ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
        </button>
      </span>
      <span id={descId} className="sr-only">
        Hold Space or Enter to talk, release to send, Escape to cancel.
      </span>
      <div aria-live="polite" className="sr-only">
        {helper ?? (sending ? 'Transcribing' : '')}
      </div>
      {helper && (
        <p aria-hidden="true" className={`pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-[calc(100vw-2rem)] text-right rounded-lg border bg-surface-2 px-3 py-1.5 text-xs ${cancelling ? 'border-danger text-danger' : 'border-border text-foreground'}`}>{helper}</p>
      )}
      {message && (
        <p role="alert" className="absolute bottom-full right-0 z-10 mb-2 w-64 rounded-lg border border-danger bg-surface-2 p-2 text-xs text-danger">
          {message}
        </p>
      )}
    </div>
  )
}
