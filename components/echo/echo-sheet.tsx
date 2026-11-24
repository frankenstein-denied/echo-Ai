'use client'

/**
 * EchoSheet: the bottom sheet behind the tab bar's Echo orb.
 * Props: open, onClose, user, profile, onNavigate (OPEN on a saved card; the sheet closes first),
 * onFullCall (close the sheet, go to the diary and start the voice call).
 * Opens listening at once. When the user stops (or the 60 s cap hits) the words go through quickSend (saved to
 * today's diary page) and the sheet shows Echo's reply and the saved cards with Undo. "Type instead" swaps in the
 * tell-Echo box; a denied mic or a failed send leaves a short message and the typed / heard words kept.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { Keyboard, Loader2, Mic, Phone, RotateCcw, Square } from 'lucide-react'
import type { UserProfile } from '@/lib/firestore'
import type { SavedItem } from '@/lib/echo/client'
import { quickSend, quickSendError, undoSaved } from '@/lib/echo/quick-send'
import { isPermissionDenied, RULES_MESSAGE } from '@/lib/echo/diary'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { cn } from '@/lib/utils'
import { AskEcho } from './ask-echo'
import type { HomeView } from './home'
import { ECHO_ORB_STYLE } from './mobile-tabbar'
import { SavedCard } from './saved-card'
import { Sheet } from './sheet'
import { useDictation } from './use-dictation'

const VIEW_FOR: Partial<Record<SavedItem['type'], HomeView>> = { note: 'Notes', goal: 'Goals', health: 'Health', reminder: 'Reminders', connector: 'Connectors', memory: '2nd Brain' }
const BARS = 11

type Phase = { kind: 'voice' } | { kind: 'sending'; text: string } | { kind: 'sent'; text: string; reply: string; saved: SavedItem[]; failed: string[] } | { kind: 'failed'; text: string; error: string }

type Props = { user: User; profile: UserProfile; onClose: () => void; onNavigate: (v: HomeView) => void; onFullCall: () => void }

export function EchoSheet({ open, ...props }: Props & { open: boolean }) {
  return (
    <Sheet open={open} onClose={props.onClose} title="Tell Echo">
      <EchoSheetBody {...props} />
    </Sheet>
  )
}

const chip = `inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-4 text-sm text-muted-foreground hover:text-foreground ${FOCUS_RING}`

function EchoSheetBody({ user, profile, onClose, onNavigate, onFullCall }: Props) {
  const [mode, setMode] = useState<'voice' | 'type'>('voice')
  const [phase, setPhase] = useState<Phase>({ kind: 'voice' })
  const [undone, setUndone] = useState<Set<number>>(() => new Set())
  const [undoError, setUndoError] = useState('')
  const [bars, setBars] = useState<number[]>(() => Array(BARS).fill(0))
  const alive = useRef(true)

  const send = useCallback(
    async (text: string) => {
      setPhase({ kind: 'sending', text })
      setUndone(new Set())
      setUndoError('')
      try {
        const out = await quickSend({ user, profile, text })
        if (alive.current) setPhase({ kind: 'sent', text, reply: out.reply, saved: out.saved, failed: out.failed.filter((f) => f !== 'reply') })
      } catch (e) {
        // Nothing was saved: keep the words so a retry sends the same thing.
        if (alive.current) setPhase({ kind: 'failed', text, error: isPermissionDenied(e) ? RULES_MESSAGE : quickSendError(e) })
      }
    },
    [user, profile],
  )
  const dictation = useDictation(user, { onAutoStop: (heard) => void send(heard) })
  const { start, stop, cancel } = dictation
  const recording = dictation.state === 'recording'
  const transcribing = dictation.state === 'transcribing'

  // Listen as soon as the sheet opens.
  useEffect(() => {
    alive.current = true
    void start()
    return () => {
      alive.current = false
    }
  }, [start])

  // A rolling strip of the last few input levels for the wave.
  useEffect(() => {
    if (!recording) return
    setBars((b) => [...b.slice(1), Math.min(1, dictation.level * 6)])
  }, [dictation.level, recording])

  const finish = async () => {
    const heard = await stop()
    if (heard) void send(heard)
  }
  const listenAgain = () => {
    setPhase({ kind: 'voice' })
    setBars(Array(BARS).fill(0))
    void start()
  }
  const typeInstead = () => {
    cancel()
    setMode('type')
  }
  const fullCall = () => {
    cancel()
    onFullCall()
  }
  const open = (v: HomeView) => {
    cancel()
    onNavigate(v)
  }
  const undo = async (i: number, item: SavedItem) => {
    try {
      if (await undoSaved(user.uid, item)) setUndone((s) => new Set(s).add(i))
    } catch (e) {
      setUndoError(isPermissionDenied(e) ? RULES_MESSAGE : `Couldn't undo "${item.label}". Try again.`)
    }
  }

  const footer = (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {mode === 'voice' ? (
        <button type="button" className={chip} onClick={typeInstead}>
          <Keyboard size={16} aria-hidden="true" /> Type instead
        </button>
      ) : (
        <button
          type="button"
          className={chip}
          onClick={() => {
            setMode('voice')
            listenAgain()
          }}
        >
          <Mic size={16} aria-hidden="true" /> Speak instead
        </button>
      )}
      <button type="button" className={chip} onClick={fullCall}>
        <Phone size={16} aria-hidden="true" /> Full call
      </button>
    </div>
  )

  if (mode === 'type') {
    return (
      <div className="px-2 pb-2">
        <AskEcho user={user} profile={profile} placeholder="Tell Echo anything…" onNavigate={open} autoFocus />
        {footer}
      </div>
    )
  }

  const status =
    phase.kind === 'sending'
      ? 'Echo is saving it…'
      : phase.kind === 'sent'
        ? 'Done'
        : phase.kind === 'failed'
          ? "Couldn't send that"
          : transcribing
            ? 'Got it, writing it down…'
            : recording
              ? "I'm listening…"
              : dictation.state === 'error'
                ? "I couldn't hear you"
                : 'Starting the mic…'
  const heardText = phase.kind === 'voice' ? '' : phase.text
  const level = recording ? Math.min(1, dictation.level * 6) : 0

  return (
    <div className="px-2 pb-2">
      <div className="flex flex-col items-center text-center">
        <button
          type="button"
          onClick={() => (recording ? void finish() : phase.kind === 'voice' && !transcribing ? listenAgain() : undefined)}
          disabled={transcribing || phase.kind === 'sending'}
          aria-label={recording ? 'Done talking, send to Echo' : 'Start listening'}
          className={cn('mt-1 grid size-16 place-items-center rounded-full text-primary-foreground transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface', (transcribing || phase.kind === 'sending') && 'echo-pulse')}
          style={{ ...ECHO_ORB_STYLE, boxShadow: `0 0 ${24 + level * 30}px #2dd4bf77`, transform: `scale(${1 + level * 0.08})` }}
        >
          {transcribing || phase.kind === 'sending' ? <Loader2 size={22} className="animate-spin" aria-hidden="true" /> : recording ? <Square size={20} aria-hidden="true" /> : <Mic size={22} aria-hidden="true" />}
        </button>
        <p role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-foreground">
          {status}
        </p>
        {phase.kind === 'voice' && (
          <div aria-hidden="true" className="flex h-11 items-center justify-center gap-[3px]">
            {bars.map((b, i) => (
              <i key={i} className="block w-[3px] rounded-full bg-primary transition-[height] duration-100" style={{ height: `${recording ? 4 + b * 36 : 4}px` }} />
            ))}
          </div>
        )}
        {heardText && <p className="mt-2 text-sm leading-snug text-foreground">&ldquo;{heardText}&rdquo;</p>}
        {phase.kind === 'voice' && dictation.state === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {dictation.error}
          </p>
        )}
        {phase.kind === 'voice' && recording && <p className="text-xs text-muted-foreground">Tap the orb when you&apos;re done.</p>}
      </div>

      {phase.kind === 'failed' && (
        <div className="mt-3 grid gap-2">
          <p role="alert" className="text-center text-sm text-danger">
            {phase.error}
          </p>
          <div className="flex justify-center">
            <button type="button" className={chip} onClick={() => void send(phase.text)}>
              <RotateCcw size={16} aria-hidden="true" /> Try again
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'sent' && (
        <div aria-live="polite" className="mt-3 grid gap-1.5">
          {phase.reply && (
            <p className="px-1 text-sm text-muted-foreground">
              <span className="font-medium text-primary">Echo:</span> {phase.reply}
            </p>
          )}
          {phase.saved.map((item, i) => {
            const canUndo = !!item.docId && item.op === undefined
            const view = VIEW_FOR[item.type]
            return <SavedCard key={`${item.type}-${item.docId ?? item.label}-${i}`} item={item} undone={undone.has(i)} onUndo={canUndo ? () => void undo(i, item) : undefined} onOpen={view ? () => open(view) : undefined} />
          })}
          {phase.failed.length > 0 && <p className="px-1 text-sm text-warning">Couldn&apos;t save: {phase.failed.join(', ')}</p>}
          {undoError && (
            <p role="alert" className="px-1 text-sm text-danger">
              {undoError}
            </p>
          )}
          <div className="mt-2 flex justify-center gap-2">
            <button type="button" className={chip} onClick={listenAgain}>
              <Mic size={16} aria-hidden="true" /> Say more
            </button>
            <button type="button" onClick={onClose} className={`inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover ${FOCUS_RING}`}>
              Done
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'voice' && dictation.state === 'error' && (
        <div className="mt-3 flex justify-center">
          <button type="button" className={chip} onClick={listenAgain}>
            <RotateCcw size={16} aria-hidden="true" /> Try again
          </button>
        </div>
      )}
      {footer}
    </div>
  )
}
