'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { limit, limitToLast, onSnapshot, orderBy, query } from 'firebase/firestore'
import { Check, Send, Square, Volume2 } from 'lucide-react'
import { addPageMessage, memoriesCol, pageMessagesCol, type EchoCategory, type Memory, type Message, type UserProfile } from '@/lib/firestore'
import { applyEchoResponse, saveReply, sendToEcho, type SavedItem } from '@/lib/echo/client'
import { isPermissionDenied, RULES_MESSAGE } from '@/lib/echo/diary'
import { dropTrailingUser, queueTranscript } from '@/lib/echo/send-helpers'
import { buildContext } from '@/lib/echo/context'
import { speak, VoiceError } from '@/lib/echo/voice-client'
import { DEFAULT_VOICE_PREFS, loadVoicePrefs, type VoicePrefs } from '@/lib/echo/voice-prefs'
import { Alert, Badge, Button, Card, IconButton, Orb, Skeleton } from './ui'
import type { NodeType } from '@/lib/echo/ui-classes'
import { MicButton, type MicState } from './mic-button'
import { GoalProgress, HealthToday, TodayReminders, useToday } from './home-panels'

export type HomeView = 'Notes' | 'Goals' | 'Health' | 'Reminders' | 'Connectors' | '2nd Brain'

type ChatMessage = Message & { id: string }
type Extras = { trace: string[]; saved: SavedItem[]; failed: string[] }
type ReplyRetry = { reply: string; category: EchoCategory; extras: Extras }
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

function ActionBadges({ types, onNavigate }: { types: string[]; onNavigate: (v: HomeView) => void }) {
  const shown = [...new Set(types)].filter((t) => LABEL_FOR[t])
  if (!shown.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {shown.map((t) => (
        <button key={t} onClick={() => onNavigate(VIEW_FOR[t])} title={`Open ${VIEW_FOR[t]}`} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Badge type={NODE_FOR[t]}>{LABEL_FOR[t]}</Badge>
        </button>
      ))}
    </div>
  )
}

function Trace({ steps }: { steps: string[] }) {
  if (!steps.length) return null
  return (
    <details className="mt-3">
      <summary className="cursor-pointer rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">AI trace · {steps.length} {steps.length === 1 ? 'step' : 'steps'}</summary>
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

export function Home({ user, profile, pageId, onEnsurePage, onNavigate }: { user: User; profile: UserProfile; pageId: string | null; onEnsurePage: () => Promise<string>; onNavigate: (v: HomeView) => void }) {
  const uid = user.uid
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
  const endRef = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const [prefs, setPrefs] = useState<VoicePrefs | null>(null) // null until read, so voice UI never flashes
  const prefsRef = useRef<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const [micState, setMicState] = useState<MicState>('idle')
  const [hint, setHint] = useState<string | null>(null)
  const [sttQuotaOff, setSttQuotaOff] = useState(false)
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

  // TTS quota: stop speaking replies. STT quota: mic can't start (an in-progress recording is never unmounted). One shared notice.
  const markTtsQuota = useCallback(() => {
    ttsQuotaOff.current = true
    setQuotaNotice(true)
  }, [])
  const markSttQuota = useCallback(() => {
    setSttQuotaOff(true)
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, thinking, error])

  const messagesRef = useRef<ChatMessage[]>([])
  const memoriesRef = useRef(memories)
  useEffect(() => {
    messagesRef.current = messages ?? []
    memoriesRef.current = memories
  }, [messages, memories])

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
      setHint(null)
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
        const echoP = sendToEcho(user, msg, buildContext(profile, history, memoriesRef.current))
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
        if (res.error) {
          setError({ text: msg, userSaved, message: 'Echo is having trouble right now.', reply: res.reply, trace: res.trace })
          return
        }
        const applied = await applyEchoResponse(uid, page, res)
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
            replyRetry: { reply: applied.reply, category: applied.category, extras: ex },
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
    [uid, user, profile, onEnsurePage, stopAudio, speakReply],
  )
  useEffect(() => {
    sendRef.current = send
  }, [send])

  // Retry only the reply write; actions were already applied for this send.
  const retryReply = useCallback(
    async (r: ReplyRetry) => {
      const page = pageRef.current
      if (busy.current || !page) return
      busy.current = true
      setThinking(true)
      setError(null)
      try {
        const id = await saveReply(uid, page, r.reply, r.category)
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
    if (!t || thinking || micState !== 'idle') return
    setText('')
    void send(t)
  }

  return (
    <div className="grid gap-5">
      <div className="min-w-0">
        <div className="flex flex-col items-center justify-center py-3 text-center">
          <Orb thinking={thinking} listening={micState === 'recording'} speaking={speaking} />
          <p role="status" className="mt-5 text-sm text-muted-foreground">{micState === 'recording' ? 'Listening...' : micState === 'transcribing' ? 'Transcribing...' : speaking ? 'Echo is speaking...' : thinking ? 'Echo is thinking...' : "What's on your mind?"}</p>
        </div>

        <div className="mb-5 flex max-h-[420px] flex-col gap-4 overflow-y-auto pr-1">
          {listenError && <Alert variant="danger">{listenError}</Alert>}
          {messages === null && !listenError && <Skeleton className="h-16 max-w-xl" />}
          {messages?.length === 0 && !thinking && !error && <p className="text-center text-sm text-muted-foreground">Say anything. Echo will remember what matters.</p>}
          {(messages ?? []).map((m) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-lg whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary-soft px-4 py-3 text-sm text-foreground">{m.text}</div>
                </div>
              )
            }
            const ex = extras[m.id]
            const types = ex ? ex.saved.map((s) => s.type) : m.category ? [m.category] : []
            return (
              <div key={m.id} className="max-w-xl">
                <Card className="p-4">
                  <p className="whitespace-pre-wrap text-sm leading-6">{m.text}</p>
                  <ActionBadges types={types} onNavigate={onNavigate} />
                  {ex?.failed.length ? <p className="mt-3 text-xs text-warning">Could not save: {ex.failed.join(', ')}</p> : null}
                  {ex ? <Trace steps={ex.trace} /> : null}
                </Card>
              </div>
            )
          })}
          {thinking && (
            <div className="max-w-xl">
              <Card className="p-4">
                <p className="animate-pulse text-sm text-muted-foreground">Thinking...</p>
              </Card>
            </div>
          )}
          {error && (
            <div className="max-w-xl">
              <Card className="border-danger/40 p-4">
                {error.reply && <p className="mb-2 whitespace-pre-wrap text-sm leading-6">{error.reply}</p>}
                <Alert variant="danger">{error.message}</Alert>
                {error.trace ? <Trace steps={error.trace} /> : null}
                <div className="mt-3">
                  <Button size="sm" onClick={() => (error.replyRetry ? void retryReply(error.replyRetry) : void send(error.text, error.userSaved))} disabled={thinking}>
                    Retry
                  </Button>
                </div>
              </Card>
            </div>
          )}
          {queuedText && <p className="text-center text-xs text-muted-foreground">Queued, will send next: “{queuedText}”</p>}
          {hint && <p className="text-center text-sm text-muted-foreground">{hint}</p>}
          {quotaNotice && <Alert variant="warning">Echo&apos;s voice reached today&apos;s free limit — replies will stay as text.</Alert>}
          <div ref={endRef} />
        </div>

        <Card className="p-3">
          <div className="flex items-center gap-3">
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
              placeholder="Tell Echo anything..."
              className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {tapToPlay && (
              <Button variant="secondary" size="sm" icon={Volume2} onClick={() => void playAudio(tapToPlay)}>
                Tap to play
              </Button>
            )}
            {speaking && (
              <IconButton icon={Square} label="Stop speaking" variant="secondary" onClick={stopAudio} />
            )}
            {prefs?.enabled && (
              <MicButton
                user={user}
                disabled={sttQuotaOff}
                onStateChange={(s) => {
                  setMicState(s)
                  if (s === 'recording') {
                    stopAudio()
                    setHint(null)
                  }
                }}
                onTranscript={(t) => void send(t)}
                onEmpty={() => setHint("I didn't catch that. Try again?")}
                onQuota={markSttQuota}
              />
            )}
            <IconButton icon={Send} label="Send" variant="primary" onClick={submit} disabled={thinking || micState !== 'idle' || !text.trim()} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <TodayReminders uid={uid} day={day} />
        <HealthToday uid={uid} day={day} onNavigate={onNavigate} />
        <GoalProgress uid={uid} onNavigate={onNavigate} />
      </div>
    </div>
  )
}
