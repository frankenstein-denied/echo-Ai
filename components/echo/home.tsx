'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { limit, limitToLast, onSnapshot, orderBy, query } from 'firebase/firestore'
import { CalendarCheck, Check, PanelRightClose, PanelRightOpen, Phone, Send, Sparkles, Square, Undo2, Volume2 } from 'lucide-react'
import { addPageMessage, connectorsCol, memoriesCol, pageMessagesCol, setConnectorSecret, type EchoCategory, type Memory, type Message, type UserProfile } from '@/lib/firestore'
import { applyEchoResponse, restoreDeleted, saveReply, sendToEcho, watchRefSource, type SavedItem } from '@/lib/echo/client'
import { isPermissionDenied, RULES_MESSAGE } from '@/lib/echo/diary'
import { deriveCategory, dropTrailingUser, queueTranscript } from '@/lib/echo/send-helpers'
import { sanitizeSources, type Source } from '@/lib/echo/view-helpers'
import { connectorStatuses, isConnected, type ConnectorState } from '@/lib/echo/connectors'
import { buildContext, buildItemsContext, type RefMap, type RefSource } from '@/lib/echo/context'
import { createUndoStore, undoLabel, type UndoEntry, type UndoInput } from '@/lib/echo/undo'
import { speak, VoiceError } from '@/lib/echo/voice-client'
import { DEFAULT_VOICE_PREFS, loadVoicePrefs, type VoicePrefs } from '@/lib/echo/voice-prefs'
import { Alert, Badge, Button, IconButton, Skeleton } from './ui'
import type { NodeType } from '@/lib/echo/ui-classes'
import { CallBar, CallScreen, useEchoCall, type CallTurn, type LateResult } from './call-panel'
import { TodayDrawer, TodayPanel, useToday } from './home-panels'
import { Sheet } from './sheet'
import { useCallFlag, useIsMobile } from './use-mobile'

export type HomeView = 'Notes' | 'Goals' | 'Health' | 'Reminders' | 'Connectors' | '2nd Brain'

type ChatMessage = Message & { id: string }
type Extras = { trace: string[]; saved: SavedItem[]; failed: string[] }
type ReplyRetry = { reply: string; category: EchoCategory; extras: Extras; sources?: Source[] }
type SendError = { text: string; userSaved: boolean; message: string; reply?: string; trace?: string[]; replyRetry?: ReplyRetry }

const VIEW_FOR: Record<string, HomeView> = {
  note: 'Notes',
  goal: 'Goals',
  health: 'Health',
  reminder: 'Reminders',
  connector: 'Connectors',
}
const NODE_FOR: Record<string, NodeType> = { note: 'diary', goal: 'goal', health: 'health', reminder: 'task', connector: 'connector' }
const LABEL_FOR: Record<string, string> = { note: 'Note', goal: 'Goal', health: 'Health', reminder: 'Reminder', connector: 'Connector' }

type BadgeItem = Pick<SavedItem, 'op' | 'kcal'> & { type: string }

/** Badge text: "Reminder", "Reminder updated", "Note deleted", "Meal · 540 kcal". */
export function badgeLabel(i: BadgeItem): string {
  const base = i.kcal !== undefined ? 'Meal' : LABEL_FOR[i.type]
  const verb = i.op === 'update' ? ' updated' : i.op === 'delete' ? ' deleted' : ''
  return `${base}${verb}${i.kcal !== undefined && i.op !== 'delete' ? ` · ${i.kcal.toLocaleString('en-US')} kcal` : ''}`
}

function ActionBadges({ items, onNavigate }: { items: BadgeItem[]; onNavigate: (v: HomeView) => void }) {
  const seen = new Set<string>()
  const shown = items.filter((i) => {
    if (!LABEL_FOR[i.type]) return false
    const label = badgeLabel(i)
    // Meals are listed one by one (each has its own total); other kinds collapse to one badge per label.
    const key = i.kcal !== undefined ? `${label}#${seen.size}` : label
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!shown.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {shown.map((i, n) => (
        <button key={`${badgeLabel(i)}-${n}`} onClick={() => onNavigate(VIEW_FOR[i.type])} title={`Open ${VIEW_FOR[i.type]}`} className="touch-hit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Badge type={NODE_FOR[i.type]}>{badgeLabel(i)}</Badge>
        </button>
      ))}
    </div>
  )
}

/** Undo toasts for deletes Echo made (10 s each). */
function UndoToasts({ entries, onUndo }: { entries: UndoEntry[]; onUndo: (key: number) => void }) {
  if (!entries.length) return null
  return (
    <div className="mb-2 grid gap-2">
      {entries.map((e) => (
        <div key={e.key} role="status" className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">
          <span className="min-w-0 truncate">{undoLabel(e)}</span>
          <Button variant="ghost" size="sm" icon={Undo2} onClick={() => onUndo(e.key)} className="max-lg:h-11">
            Undo
          </Button>
        </div>
      ))}
    </div>
  )
}

function Trace({ steps }: { steps: string[] }) {
  if (!steps.length) return null
  return (
    <details className="mt-2">
      <summary className="cursor-pointer rounded text-xs max-lg:py-3.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">AI trace · {steps.length} {steps.length === 1 ? 'step' : 'steps'}</summary>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
        {steps.map((s, i) => (
          <p key={i}>
            <Check aria-hidden="true" className="mr-2 inline text-success" size={14} />
            {s}
          </p>
        ))}
      </div>
    </details>
  )
}

function EchoAvatar() {
  return (
    <div aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
      <Sparkles size={16} />
    </div>
  )
}

const timeLabel = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function UserBubble({ text, at }: { text: string; at?: Date | null }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-sm text-foreground max-lg:px-3.5 max-lg:text-[15px] max-lg:leading-[22px]">{text}</div>
      {at && <time className="px-1 text-xs text-subtle">{timeLabel(at)}</time>}
    </div>
  )
}

function EchoRow({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <div className="flex max-w-[92%] items-start gap-3 max-lg:gap-2" aria-live={live ? 'polite' : undefined}>
      <EchoAvatar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function EchoBubble({ children }: { children: ReactNode }) {
  return <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-surface-2 px-4 py-2.5 text-sm leading-6 text-foreground max-lg:px-3.5 max-lg:text-[15px] max-lg:leading-[22px]">{children}</div>
}

function SourceLinks({ sources }: { sources?: Source[] }) {
  const links = sanitizeSources(sources)
  if (!links.length) return null
  return (
    <ul className="mt-1.5 grid gap-0.5 px-1 text-xs text-subtle" aria-label="Sources">
      {links.map((s) => (
        <li key={s.url} className="min-w-0">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="block max-w-full truncate hover:text-foreground hover:underline" title={s.title}>
            {s.title}
          </a>
        </li>
      ))}
    </ul>
  )
}

function CallTurnBubbles({ user, echo, saved, live = false, onNavigate }: { user: string; echo: string; saved: SavedItem[]; live?: boolean; onNavigate?: (v: HomeView) => void }) {
  return (
    <>
      {user && <UserBubble text={user} />}
      {(echo || saved.length > 0) && (
        <EchoRow live={live}>
          {echo && <EchoBubble>{echo}</EchoBubble>}
          {onNavigate ? <ActionBadges items={saved} onNavigate={onNavigate} /> : null}
        </EchoRow>
      )}
    </>
  )
}

const TODAY_KEY = 'echo.diary.todayCollapsed'

export function Home({ user, profile, pageId, onEnsurePage, disabled = false, onNavigate, header, meta, hint }: { user: User; profile: UserProfile; pageId: string | null; onEnsurePage: () => Promise<string>; disabled?: boolean; onNavigate: (v: HomeView) => void; header: ReactNode; meta?: string; hint?: string }) {
  const uid = user.uid
  const [todayCollapsed, setTodayCollapsed] = useState(false)
  const [todayDrawer, setTodayDrawer] = useState(false)
  const mobile = useIsMobile()
  const callBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    try {
      setTodayCollapsed(localStorage.getItem(TODAY_KEY) === '1')
    } catch {}
  }, [])
  const toggleToday = () => {
    const next = !todayCollapsed
    setTodayCollapsed(next)
    try {
      localStorage.setItem(TODAY_KEY, next ? '1' : '0')
    } catch {}
  }
  const pageRef = useRef(pageId)
  useEffect(() => {
    if (pageId) pageRef.current = pageId
  }, [pageId])
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [listenError, setListenError] = useState<string | null>(null)
  const [memories, setMemories] = useState<(Memory & { id: string })[]>([])
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<SendError | null>(null)
  const [extras, setExtras] = useState<Record<string, Extras>>({})
  const day = useToday()
  const scroller = useRef<HTMLDivElement>(null)
  const scrollEnd = useCallback(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])
  const busy = useRef(false)
  const [prefs, setPrefs] = useState<VoicePrefs | null>(null) // null until read, so voice UI never flashes
  const prefsRef = useRef<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const ttsQuotaOff = useRef(false)
  const [quotaNotice, setQuotaNotice] = useState(false)
  const queued = useRef<string | null>(null)
  const [queuedText, setQueuedText] = useState<string | null>(null)
  const sendRef = useRef<(t: string, saved?: boolean) => Promise<void>>(async () => undefined)
  const [speaking, setSpeaking] = useState(false)
  const [tapToPlay, setTapToPlay] = useState<HTMLAudioElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakSeq = useRef(0)

  useEffect(() => {
    const p = loadVoicePrefs()
    prefsRef.current = p
    setPrefs(p)
  }, [])

  const stopAudio = useCallback(() => {
    speakSeq.current++
    const a = audioRef.current
    audioRef.current = null
    if (a) {
      a.pause()
      if (a.src.startsWith('blob:')) URL.revokeObjectURL(a.src)
    }
    setSpeaking(false)
    setTapToPlay(null)
  }, [])
  useEffect(() => stopAudio, [stopAudio])

  // TTS quota: stop speaking typed replies (calls are unaffected).
  const markTtsQuota = useCallback(() => {
    ttsQuotaOff.current = true
    setQuotaNotice(true)
  }, [])

  const playAudio = useCallback(async (a: HTMLAudioElement) => {
    audioRef.current = a
    a.addEventListener('ended', () => setSpeaking(false), { once: true })
    a.addEventListener('pause', () => setSpeaking(false), { once: true })
    try {
      await a.play()
      setTapToPlay(null)
      setSpeaking(true)
    } catch {
      setTapToPlay(a) // autoplay blocked: user taps to play
    }
  }, [])

  const speakReply = useCallback(
    async (reply: string) => {
      const p = prefsRef.current
      if (!reply || !p.enabled || !p.autoSpeak || ttsQuotaOff.current) return
      stopAudio()
      const seq = speakSeq.current
      try {
        const a = await speak(user, reply, p.voice)
        if (seq !== speakSeq.current) {
          URL.revokeObjectURL(a.src)
          return
        }
        await playAudio(a)
      } catch (e) {
        if (e instanceof VoiceError && e.kind === 'quota') markTtsQuota()
        else console.warn('Echo: could not speak reply')
      }
    },
    [user, stopAudio, playAudio, markTtsQuota],
  )

  useEffect(() => {
    setListenError(null)
    if (!pageId) {
      setMessages([])
      return
    }
    const q = query(pageMessagesCol(uid, pageId), orderBy('createdAt'), limitToLast(50))
    return onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }))),
      (e) => {
        console.error('messages listener', e)
        setListenError(isPermissionDenied(e) ? RULES_MESSAGE : 'Could not load your conversation.')
        setMessages((m) => m ?? [])
      },
    )
  }, [uid, pageId])

  useEffect(() => {
    const q = query(memoriesCol(uid), orderBy('mentions', 'desc'), limit(40))
    return onSnapshot(
      q,
      (snap) => setMemories(snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }))),
      (e) => {
        console.error('memories listener', e)
        setListenError((m) => m ?? 'Could not load your memories.')
      },
    )
  }, [uid])

  // Connector states and the sealed Web search tokens, kept in refs for the request and call paths.
  const connectorsRef = useRef<{ statuses: ConnectorState[]; sealed: string }>({ statuses: connectorStatuses([]), sealed: '' })
  useEffect(() => {
    return onSnapshot(
      connectorsCol(uid),
      (snap) => {
        const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        const web = docs.find((d) => d.id === 'web-search')
        connectorsRef.current = { statuses: connectorStatuses(docs), sealed: typeof web?.sealed === 'string' ? web.sealed : '' }
      },
      (e) => console.error('connectors listener', e),
    )
  }, [uid])
  const webSearchKey = () => {
    const { statuses, sealed } = connectorsRef.current
    return isConnected(statuses, 'web-search') && sealed ? sealed : undefined
  }

  useEffect(() => {
    scrollEnd()
  }, [messages, thinking, error])

  const messagesRef = useRef<ChatMessage[]>([])
  const memoriesRef = useRef(memories)
  useEffect(() => {
    messagesRef.current = messages ?? []
    memoriesRef.current = memories
  }, [messages, memories])

  // Short-ref lists of the user's items (open reminders, goals, notes, today's health/meals) so Echo can edit them.
  const refSource = useRef<RefSource | null>(null)
  useEffect(() => watchRefSource(uid, day, (src) => (refSource.current = src)), [uid, day])
  const buildItems = useCallback((): { items: ReturnType<typeof buildItemsContext>['items']; refs: RefMap } | undefined => {
    const src = refSource.current
    if (!src) return undefined
    return buildItemsContext(src, Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  }, [])

  // Undo for deletes Echo makes: the doc is recreated with the same id and fields (see lib/echo/undo.ts).
  const undoStore = useRef(createUndoStore())
  const [undos, setUndos] = useState<UndoEntry[]>([])
  const [undoError, setUndoError] = useState<string | null>(null)
  useEffect(() => undoStore.current.subscribe(setUndos), [])
  useEffect(() => {
    if (!undos.length) return
    const t = setInterval(() => undoStore.current.expire(), 500)
    return () => clearInterval(t)
  }, [undos.length])
  const pushUndo = useCallback((e: UndoInput) => {
    setUndoError(null)
    undoStore.current.push(e)
  }, [])
  const undoDelete = useCallback(
    async (key: number) => {
      const e = undoStore.current.take(key)
      if (!e) return
      try {
        await restoreDeleted(uid, e)
      } catch (err) {
        console.error('Echo: could not undo delete', err)
        setUndoError(isPermissionDenied(err) ? RULES_MESSAGE : `Couldn't restore the ${e.kind} "${e.title}".`)
      }
    },
    [uid],
  )

  // Shared send path (typed text now; voice transcripts later).
  const send = useCallback(
    async (raw: string, alreadySaved = false) => {
      const msg = raw.trim()
      if (!msg) return
      if (busy.current) {
        // A send is in flight: keep the text and send it right after (never drop it).
        queued.current = queueTranscript(queued.current, msg)
        setQueuedText(queued.current)
        return
      }
      busy.current = true
      setThinking(true)
      setError(null)
      stopAudio()
      let userSaved = alreadySaved
      let pid = pageRef.current
      // Context is built from messages before this one so it is not sent twice.
      const history = alreadySaved ? dropTrailingUser(messagesRef.current, msg) : messagesRef.current
      try {
        if (!pid) {
          try {
            pid = await onEnsurePage()
            pageRef.current = pid
          } catch (e) {
            console.error('Echo: could not create page', e)
            setError({ text: msg, userSaved: false, message: isPermissionDenied(e) ? RULES_MESSAGE : 'Could not start a new page.' })
            return
          }
        }
        const page = pid
        // Write the user message and call the router in parallel.
        const userP: Promise<void> = userSaved ? Promise.resolve() : addPageMessage(uid, page, 'user', msg).then(() => undefined)
        const built = buildItems()
        const echoP = sendToEcho(user, msg, buildContext(profile, history, memoriesRef.current, built?.items, connectorsRef.current.statuses), webSearchKey())
        echoP.catch(() => undefined)
        try {
          await userP
          userSaved = true
        } catch (e) {
          console.error('Echo: could not save message', e)
          setError({ text: msg, userSaved: false, message: isPermissionDenied(e) ? RULES_MESSAGE : 'Could not save your message.' })
          return
        }
        const res = await echoP
        // Web search login: keep refreshed tokens, or disconnect when Tavily no longer accepts the login.
        if (res.webSearchRevoked) void setConnectorSecret(uid, 'web-search', null).catch((e) => console.error('Echo: could not disconnect Web search', e))
        else if (res.webSearchResealed) void setConnectorSecret(uid, 'web-search', res.webSearchResealed).catch((e) => console.error('Echo: could not save the Web search login', e))
        if (res.error) {
          setError({ text: msg, userSaved, message: 'Echo is having trouble right now.', reply: res.reply, trace: res.trace })
          return
        }
        const applied = await applyEchoResponse(uid, page, res, { refs: built?.refs, source: 'chat', onDeleted: pushUndo })
        void speakReply(applied.reply)
        const ex: Extras = { trace: res.trace, saved: applied.saved, failed: applied.failed.filter((f) => f !== 'reply') }
        if (applied.messageId) {
          setExtras((x) => ({ ...x, [applied.messageId as string]: { ...ex, failed: applied.failed } }))
        } else if (applied.reply) {
          setError({
            text: msg,
            userSaved,
            message: 'Echo replied, but the reply could not be saved.',
            reply: applied.reply,
            trace: res.trace,
            replyRetry: { reply: applied.reply, category: applied.category, extras: ex, sources: applied.sources },
          })
        } else if (applied.failed.length) {
          setError({ text: msg, userSaved, message: `Could not save: ${applied.failed.join(', ')}` })
        }
      } catch (e) {
        setError({ text: msg, userSaved, message: e instanceof Error ? e.message : 'Something went wrong.' })
      } finally {
        busy.current = false
        setThinking(false)
        const next = queued.current
        if (next) {
          queued.current = null
          setQueuedText(null)
          setTimeout(() => void sendRef.current(next), 0)
        }
      }
    },
    [uid, user, profile, onEnsurePage, stopAudio, speakReply, buildItems, pushUndo],
  )
  useEffect(() => {
    sendRef.current = send
  }, [send])

  // Call turns: persisted in order (user, then Echo) to the open page, creating one if needed.
  // A finished turn stays on screen as a pending bubble until its messages are written.
  const [pendingTurns, setPendingTurns] = useState<(CallTurn & { key: number; at: number })[]>([])
  const [callSaveError, setCallSaveError] = useState<string | null>(null)
  const persistChain = useRef<Promise<void>>(Promise.resolve())
  const turnKey = useRef(0)
  // Writes that finish after their turn was handed off: badges are patched onto the saved reply, failures shown.
  const turnMessage = useRef(new Map<number, string>())
  const lateForTurn = useRef(new Map<number, SavedItem[]>())
  const addLateSaved = useCallback((messageId: string, saved: SavedItem[]) => {
    if (!saved.length) return
    setExtras((x) => {
      const e = x[messageId] ?? { trace: ['Voice call'], saved: [], failed: [] }
      return { ...x, [messageId]: { ...e, saved: [...e.saved, ...saved] } }
    })
  }, [])
  const onLateResult = useCallback(
    (turnId: number, r: LateResult) => {
      if (r.failed.length) {
        const isMemory = (f: string) => f === '2nd Brain memories' || f === 'save_memories'
        const other = r.failed.filter((f) => !isMemory(f))
        setCallSaveError(other.length ? `Echo couldn't save: ${other.join(', ')}` : "Echo couldn't save to your 2nd Brain")
      }
      if (!r.saved.length) return
      const mid = turnMessage.current.get(turnId)
      if (mid) addLateSaved(mid, r.saved)
      else {
        lateForTurn.current.set(turnId, [...(lateForTurn.current.get(turnId) ?? []), ...r.saved])
        setPendingTurns((p) => p.map((t) => (t.id === turnId ? { ...t, saved: [...t.saved, ...r.saved] } : t)))
      }
    },
    [addLateSaved],
  )
  const persistCallTurn = useCallback(
    (t: CallTurn) => {
      const key = ++turnKey.current
      setPendingTurns((p) => [...p, { ...t, key, at: Date.now() }])
      persistChain.current = persistChain.current.then(async () => {
        try {
          let pid = pageRef.current
          if (!pid) {
            pid = await onEnsurePage()
            pageRef.current = pid
          }
          if (t.userText) await addPageMessage(uid, pid, 'user', t.userText)
          if (t.echoText) {
            // Category from confirmed saves only (plus any confirmed late, before this write).
            const confirmed = [...t.saved, ...(lateForTurn.current.get(t.id) ?? [])]
            const id = await saveReply(uid, pid, t.echoText, deriveCategory(confirmed))
            if (!id) throw new Error('reply not saved')
            turnMessage.current.set(t.id, id)
            const lateNow = lateForTurn.current.get(t.id) ?? []
            lateForTurn.current.delete(t.id)
            setExtras((x) => ({ ...x, [id]: { trace: ['Voice call'], saved: [...t.saved, ...lateNow], failed: t.failed } }))
          }
        } catch (e) {
          console.error('Echo: could not save call turn', e)
          setCallSaveError(isPermissionDenied(e) ? RULES_MESSAGE : 'Part of the call could not be saved to this page.')
        } finally {
          setPendingTurns((p) => p.filter((x) => x.key !== key))
        }
      })
    },
    [uid, onEnsurePage],
  )
  // The call keeps the ref map that matches the items sent in its session instruction.
  const callRefs = useRef<RefMap | undefined>(undefined)
  const getCallContext = useCallback(() => {
    const built = buildItems()
    callRefs.current = built?.refs
    return buildContext(profile, messagesRef.current, memoriesRef.current, built?.items, connectorsRef.current.statuses)
  }, [profile, buildItems])
  const getCallRefs = useCallback(() => callRefs.current, [])
  const call = useEchoCall({ user, voice: prefs?.voice ?? DEFAULT_VOICE_PREFS.voice, getContext: getCallContext, getRefs: getCallRefs, onTurn: persistCallTurn, onLateResult, onDeleted: pushUndo })
  useCallFlag(call.active)
  // Keep the live call bubbles in view as they fill.
  const liveKey = call.live ? `${call.live.user.length}:${call.live.echo.length}:${call.live.saved.length}` : ''
  useEffect(() => {
    if (liveKey || pendingTurns.length) scrollEnd()
  }, [liveKey, pendingTurns.length, call.error])
  const startCall = () => {
    stopAudio()
    setCallSaveError(null)
    void call.start()
  }

  // Retry only the reply write; actions were already applied for this send.
  const retryReply = useCallback(
    async (r: ReplyRetry) => {
      const page = pageRef.current
      if (busy.current || !page) return
      busy.current = true
      setThinking(true)
      setError(null)
      try {
        const id = await saveReply(uid, page, r.reply, r.category, r.sources)
        if (id) setExtras((x) => ({ ...x, [id]: r.extras }))
        else setError({ text: '', userSaved: true, message: 'Echo replied, but the reply could not be saved.', reply: r.reply, trace: r.extras.trace, replyRetry: r })
      } finally {
        busy.current = false
        setThinking(false)
      }
    },
    [uid],
  )

  const submit = () => {
    const t = text.trim()
    if (!t || disabled || thinking || call.active) return
    setText('')
    void send(t)
  }

  const status = call.active ? '' : speaking ? 'Echo is speaking...' : thinking ? 'Echo is thinking...' : ''
  // Mobile call screen transcript: this page's messages written since the call started.
  const callStart = call.active ? call.startedAt : null
  const callMessages = callStart ? (messages ?? []).filter((m) => (m.createdAt?.toMillis?.() ?? 0) >= callStart - 1000) : []

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 max-lg:gap-1 max-lg:py-1.5 max-lg:pl-1 max-lg:pr-3">
          <div className="min-w-0 flex-1">{header}</div>
          {meta && <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{meta}</span>}
          <IconButton icon={PanelRightOpen} label="Open Today" size="sm" className="max-lg:hidden 2xl:hidden" aria-haspopup="dialog" aria-expanded={todayDrawer} onClick={() => setTodayDrawer(true)} />
          <Button variant="secondary" size="sm" icon={CalendarCheck} className="shrink-0 lg:hidden" aria-label="Open Today" aria-haspopup="dialog" aria-expanded={todayDrawer} onClick={() => setTodayDrawer(true)}>
            Today
          </Button>
          <IconButton icon={todayCollapsed ? PanelRightOpen : PanelRightClose} label={todayCollapsed ? 'Show Today panel' : 'Hide Today panel'} size="sm" className="hidden 2xl:inline-flex" aria-expanded={!todayCollapsed} onClick={toggleToday} />
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 max-lg:gap-4 max-lg:py-4">
            {listenError && <Alert variant="danger">{listenError}</Alert>}
            {messages === null && !listenError && <Skeleton className="h-16 max-w-xl" />}
            {messages?.length === 0 && !thinking && !error && !call.active && !pendingTurns.length && (
              <div className="flex flex-col items-center py-12 text-center">
                <EchoAvatar />
                <p className="mt-4 text-base font-semibold text-foreground">What&apos;s on your mind?</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {hint ? `${hint} ` : ''}Say anything. Echo will remember what matters.
                </p>
              </div>
            )}
            {(messages ?? []).map((m) => {
              const at = m.createdAt?.toDate?.() ?? null
              if (m.role === 'user') return <UserBubble key={m.id} text={m.text} at={at} />
              const ex = extras[m.id]
              const badgeItems: BadgeItem[] = ex ? ex.saved : m.category ? [{ type: m.category }] : []
              return (
                <EchoRow key={m.id}>
                  <EchoBubble>{m.text}</EchoBubble>
                  <SourceLinks sources={m.sources} />
                  <ActionBadges items={badgeItems} onNavigate={onNavigate} />
                  {ex?.failed.length ? <p className="mt-2 text-xs text-warning">Could not save: {ex.failed.join(', ')}</p> : null}
                  {ex ? <Trace steps={ex.trace} /> : null}
                  {at && <time className="mt-1 block px-1 text-xs text-subtle">{timeLabel(at)}</time>}
                </EchoRow>
              )
            })}
            {pendingTurns.map((t) => {
              // Firestore shows a write locally before it is acknowledged; hide the parts already on the page.
              const recent = (messages ?? []).slice(-6).filter((m) => (m.createdAt?.toMillis?.() ?? 0) >= t.at - 2000)
              const has = (role: string, text: string) => !!text && recent.some((m) => m.role === role && m.text === text)
              return <CallTurnBubbles key={t.key} user={has('user', t.userText) ? '' : t.userText} echo={has('assistant', t.echoText) ? '' : t.echoText} saved={has('assistant', t.echoText) ? [] : t.saved} onNavigate={onNavigate} />
            })}
            {call.live && <CallTurnBubbles user={call.live.user} echo={call.live.echo} saved={call.live.saved} live onNavigate={onNavigate} />}
            {thinking && (
              <EchoRow>
                <EchoBubble>
                  <span className="animate-pulse text-muted-foreground">Thinking...</span>
                </EchoBubble>
              </EchoRow>
            )}
            {error && (
              <EchoRow>
                {error.reply && <EchoBubble>{error.reply}</EchoBubble>}
                <div className={error.reply ? 'mt-2' : ''}>
                  <Alert variant="danger">{error.message}</Alert>
                </div>
                {error.trace ? <Trace steps={error.trace} /> : null}
                <div className="mt-3">
                  <Button size="sm" onClick={() => (error.replyRetry ? void retryReply(error.replyRetry) : void send(error.text, error.userSaved))} disabled={thinking}>
                    Retry
                  </Button>
                </div>
              </EchoRow>
            )}
            {queuedText && <p className="text-center text-xs text-muted-foreground">Queued, will send next: “{queuedText}”</p>}
            {call.error && (
              <div className="grid gap-3">
                <Alert variant={call.error.kind === 'quota' || call.error.kind === 'limit' ? 'warning' : 'danger'}>{call.error.message}</Alert>
                <div className="flex gap-2">
                  <Button size="sm" icon={Phone} onClick={startCall} disabled={disabled || thinking}>
                    {call.error.kind === 'limit' ? 'Start new call' : 'Retry call'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={call.clearError}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            {callSaveError && <Alert variant="warning">{callSaveError}</Alert>}
            {quotaNotice && <Alert variant="warning">Echo&apos;s voice reached today&apos;s free limit — replies will stay as text.</Alert>}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3 max-lg:px-3 max-lg:py-2 max-lg:pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-var(--tabbar-h)-var(--kb)+0.5rem))]">
          <div className="mx-auto w-full max-w-[720px]">
            <UndoToasts entries={undos} onUndo={(k) => void undoDelete(k)} />
            {undoError && (
              <div className="mb-2">
                <Alert variant="warning">{undoError}</Alert>
              </div>
            )}
            {status && <p role="status" aria-live="polite" className="mb-2 text-xs text-muted-foreground">{status}</p>}
            {call.active ? (
              // Below lg the full-screen CallScreen takes over.
              <div className="max-lg:hidden">
                <CallBar phase={call.phase} muted={call.muted} startedAt={call.startedAt} onMute={call.toggleMute} onEnd={call.end} />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface-2 p-1.5 max-lg:gap-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background">
                <input
                  aria-label="Message Echo"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      submit()
                    }
                  }}
                  maxLength={2000}
                  disabled={disabled}
                  placeholder="Tell Echo anything..."
                  enterKeyHint="send"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-lg:h-11 max-lg:px-2"
                />
                {tapToPlay && (
                  <Button variant="secondary" size="sm" icon={Volume2} onClick={() => void playAudio(tapToPlay)}>
                    Tap to play
                  </Button>
                )}
                {speaking && <IconButton icon={Square} label="Stop speaking" variant="secondary" onClick={stopAudio} />}
                {prefs?.enabled && <IconButton ref={callBtnRef} icon={Phone} label="Call Echo" variant="secondary" onClick={startCall} disabled={disabled || thinking} />}
                <IconButton icon={Send} label="Send" variant="primary" onClick={submit} disabled={disabled || thinking || !text.trim()} />
              </div>
            )}
          </div>
        </div>
      </div>

      {!todayCollapsed && (
        <aside aria-label="Today" className="hidden w-72 shrink-0 overflow-y-auto border-l border-border 2xl:block">
          <TodayPanel uid={uid} day={day} onNavigate={onNavigate} />
        </aside>
      )}
      {todayDrawer && !mobile && <TodayDrawer uid={uid} day={day} onNavigate={onNavigate} onClose={() => setTodayDrawer(false)} />}
      <Sheet open={todayDrawer && mobile} onClose={() => setTodayDrawer(false)} title="Today">
        <div className="-mx-3">
          <TodayPanel
            uid={uid}
            day={day}
            onNavigate={(v) => {
              setTodayDrawer(false)
              onNavigate(v)
            }}
          />
        </div>
      </Sheet>
      {call.active && (
        <CallScreen
          phase={call.phase}
          muted={call.muted}
          startedAt={call.startedAt}
          onMute={call.toggleMute}
          onEnd={call.end}
          onClosed={() => callBtnRef.current?.focus({ preventScroll: true })}
          scrollKey={`${liveKey}|${pendingTurns.length}|${callMessages.length}`}
          alerts={
            callSaveError || quotaNotice || undos.length ? (
              <>
                <UndoToasts entries={undos} onUndo={(k) => void undoDelete(k)} />
                {callSaveError && <Alert variant="warning">{callSaveError}</Alert>}
                {quotaNotice && <Alert variant="warning">Echo&apos;s voice reached today&apos;s free limit — replies will stay as text.</Alert>}
              </>
            ) : undefined
          }
        >
          {callMessages.map((m) =>
            m.role === 'user' ? (
              <UserBubble key={m.id} text={m.text} />
            ) : (
              <EchoRow key={m.id}>
                <EchoBubble>{m.text}</EchoBubble>
              </EchoRow>
            ),
          )}
          {pendingTurns.map((t) => {
            const has = (role: string, text: string) => !!text && callMessages.some((m) => m.role === role && m.text === text)
            return <CallTurnBubbles key={t.key} user={has('user', t.userText) ? '' : t.userText} echo={has('assistant', t.echoText) ? '' : t.echoText} saved={[]} />
          })}
          {call.live && <CallTurnBubbles user={call.live.user} echo={call.live.echo} saved={[]} />}
          {!callMessages.length && !pendingTurns.length && !(call.live && (call.live.user || call.live.echo)) && (
            <p className="py-6 text-center text-sm text-muted-foreground">Start talking. What you and Echo say appears here.</p>
          )}
        </CallScreen>
      )}
    </div>
  )
}
