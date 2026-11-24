'use client'

/**
 * AskEcho: the "tell Echo" box (Notes, Reminders, Music, the orb sheet's Type instead).
 * Props: user, profile, placeholder, onNavigate? (OPEN on a saved card), autoFocus?.
 * Sends through quickSend (saved to today's diary page), shows Echo's reply in one line and the saved cards
 * underneath with Undo for anything Echo created. On a failure the error shows under the box and the text stays.
 * The mic records and fills the box (the user taps send).
 */
import { useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, Loader2, Mic, Square } from 'lucide-react'
import type { UserProfile } from '@/lib/firestore'
import type { SavedItem } from '@/lib/echo/client'
import { quickSend, quickSendError, undoSaved } from '@/lib/echo/quick-send'
import { isPermissionDenied, RULES_MESSAGE } from '@/lib/echo/diary'
import type { HomeView } from './home'
import { SavedCard } from './saved-card'
import { useDictation } from './use-dictation'
import { cn } from '@/lib/utils'

const VIEW_FOR: Partial<Record<SavedItem['type'], HomeView>> = { note: 'Notes', goal: 'Goals', health: 'Health', reminder: 'Reminders', connector: 'Connectors', memory: '2nd Brain' }

export const ASK_BOX_STYLE: CSSProperties = {
  background: 'linear-gradient(var(--color-surface-2), var(--color-surface-2)) padding-box, linear-gradient(120deg, #2dd4bf88, #60a5fa55, #a78bfa55) border-box',
  border: '1px solid transparent',
}

const ORB_DOT_STYLE: CSSProperties = { background: 'radial-gradient(circle at 32% 28%, #a7f3d0, #2dd4bf 45%, #0f766e)' }

type Result = { reply: string; saved: SavedItem[]; failed: string[] }

export function AskEcho({ user, profile, placeholder, onNavigate, autoFocus = false }: { user: User; profile: UserProfile; placeholder: string; onNavigate?: (view: HomeView) => void; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [undone, setUndone] = useState<Set<number>>(() => new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const fill = (heard: string) => {
    setText((t) => (t.trim() ? `${t.trimEnd()} ${heard}` : heard))
    inputRef.current?.focus()
  }
  const dictation = useDictation(user, { onAutoStop: fill })
  const recording = dictation.state === 'recording'
  const transcribing = dictation.state === 'transcribing'

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const msg = text.trim()
    if (!msg || busy) return
    if (recording) dictation.cancel()
    setBusy(true)
    setError('')
    try {
      const out = await quickSend({ user, profile, text: msg })
      setText('')
      setUndone(new Set())
      setResult({ reply: out.reply, saved: out.saved, failed: out.failed.filter((f) => f !== 'reply') })
    } catch (err) {
      // Nothing was saved: keep the words so the user can send again.
      setError(isPermissionDenied(err) ? RULES_MESSAGE : quickSendError(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleMic = async () => {
    if (busy || transcribing) return
    if (recording) {
      const heard = await dictation.stop()
      if (heard) fill(heard)
      return
    }
    setError('')
    await dictation.start()
  }

  const undo = async (i: number, item: SavedItem) => {
    try {
      if (await undoSaved(user.uid, item)) setUndone((s) => new Set(s).add(i))
    } catch (err) {
      setError(isPermissionDenied(err) ? RULES_MESSAGE : `Couldn't undo "${item.label}". Try again.`)
    }
  }

  const micLabel = recording ? 'Stop and use what I said' : transcribing ? 'Turning speech into text' : 'Speak instead of typing'
  const note = error || (dictation.state === 'error' ? dictation.error : '')
  const ring = recording ? Math.min(1, dictation.level * 6) : 0

  return (
    <div className="grid gap-2">
      <form onSubmit={submit} className="flex items-center gap-2 rounded-2xl py-1.5 pl-3 pr-1.5" style={ASK_BOX_STYLE}>
        <span aria-hidden="true" className={cn('size-[18px] flex-none rounded-full', busy && 'animate-pulse')} style={ORB_DOT_STYLE} />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={recording ? 'Listening…' : placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          disabled={busy}
          enterKeyHint="send"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60 lg:text-sm"
        />
        <button
          type="button"
          onClick={() => void toggleMic()}
          aria-label={micLabel}
          title={micLabel}
          aria-pressed={recording}
          disabled={busy || transcribing}
          className={cn(
            'grid size-11 flex-none place-items-center rounded-full text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60',
            recording ? 'bg-danger-soft text-danger' : 'hover:bg-surface',
          )}
          style={recording ? { boxShadow: `0 0 0 ${2 + ring * 6}px color-mix(in srgb, var(--color-danger) 25%, transparent)` } : undefined}
        >
          {transcribing ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : recording ? <Square size={16} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
        </button>
        {text.trim() && (
          <button
            type="submit"
            aria-label="Send to Echo"
            disabled={busy}
            className="grid size-11 flex-none place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_16px_#2dd4bf66] hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
          </button>
        )}
      </form>

      {note && (
        <p role="alert" className="px-1 text-sm text-danger">
          {note}
        </p>
      )}

      {result && (
        <div aria-live="polite" className="grid gap-1.5">
          {result.reply && (
            <p className="truncate px-1 text-sm text-muted-foreground" title={result.reply}>
              <span className="font-medium text-primary">Echo:</span> {result.reply}
            </p>
          )}
          {result.saved.map((item, i) => {
            const canUndo = !!item.docId && item.op === undefined
            const view = VIEW_FOR[item.type]
            return (
              <SavedCard
                key={`${item.type}-${item.docId ?? item.label}-${i}`}
                item={item}
                undone={undone.has(i)}
                onUndo={canUndo ? () => void undo(i, item) : undefined}
                onOpen={view && onNavigate ? () => onNavigate(view) : undefined}
              />
            )
          })}
          {result.failed.length > 0 && <p className="px-1 text-sm text-warning">Couldn&apos;t save: {result.failed.join(', ')}</p>}
        </div>
      )}
    </div>
  )
}
