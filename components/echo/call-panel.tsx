'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import type { LiveServerMessage, Session } from '@google/genai'
import { Mic, MicOff, PhoneOff } from 'lucide-react'
import { applyActions, estimateMealViaApi, localIsoWithOffset, type SavedItem } from '@/lib/echo/client'
import { CaptureEncoder, decodeServerAudio, formatElapsed, INPUT_MIME, PlaybackScheduler, TranscriptSync } from '@/lib/echo/call-audio'
import { extractCheckInTime, greetingKickoff, type RefMap } from '@/lib/echo/context'
import type { UndoInput } from '@/lib/echo/undo'
import type { EchoRequest } from '@/lib/echo/types'
import { requestLiveSession, VoiceError } from '@/lib/echo/voice-client'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Button, EchoMark, IconButton, type EchoMarkState } from './ui'

export type CallPhase = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'
export type CallTurn = { id: number; userText: string; echoText: string; saved: SavedItem[]; failed: string[] }
/** Outcome of writes that finished after their turn was handed off (late acks, or failures). */
export type LateResult = { saved: SavedItem[]; failed: string[] }
export type LiveBubble = { user: string; echo: string; saved: SavedItem[] }
export type CallError = { kind: 'quota' | 'mic' | 'failed' | 'dropped' | 'limit'; message: string }

const WORKLET =
  "class P extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(1024);this.n=0}process(i){const c=i[0]&&i[0][0];if(c){for(let k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===1024){this.port.postMessage(this.b.slice(0));this.n=0}}}return true}}registerProcessor('echo-call-capture',P)"

// Model output stalled this long after the user spoke counts as "thinking" (VAD already waited 2 s of silence).
const THINKING_AFTER_MS = 2000
const TICK_MS = 80
// No server activity for this long while a reply is expected (e.g. after a tool response or cancellation):
// close the turn and go back to listening.
const WATCHDOG_MS = 10000
export const LIMIT_MESSAGE = 'Call time limit reached (a call lasts about 10 minutes). Start a new call to keep talking.'

// Dev-only timeline of server event types (never content) for debugging call timing: window.__echoCallTrace.
function trace(m: LiveServerMessage) {
  const sc = m.serverContent
  const ev = [
    sc?.modelTurn?.parts?.some((p) => p.inlineData) && 'audio',
    sc?.outputTranscription?.text && 'outText',
    sc?.inputTranscription?.text && 'inText',
    sc?.interrupted && 'interrupted',
    sc?.generationComplete && 'generationComplete',
    sc?.turnComplete && 'turnComplete',
    m.toolCall && `toolCall:${(m.toolCall.functionCalls ?? []).map((c) => c.name).join(',')}`,
    m.goAway && 'goAway',
  ].filter(Boolean)
  if (!ev.length) return
  const w = window as unknown as { __echoCallTrace?: string[] }
  w.__echoCallTrace = [...(w.__echoCallTrace ?? []).slice(-300), `${Math.round(performance.now())} ${ev.join('+')}`]
}

function micMessage(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access was blocked. Allow it in your browser settings to call Echo.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found.'
  return 'Could not use the microphone.'
}

type Turn = {
  id: number
  user: string
  sync: TranscriptSync
  saved: SavedItem[]
  failed: string[]
  modelStarted: boolean
  complete: boolean
  interrupted: boolean
  /** Playback clock time of the barge-in; reveal and persistence freeze here. */
  interruptedAt: number | null
  toolsPending: number
  lastInputAt: number
  /** Set once the turn was given to onTurn; later write outcomes go to onLateResult. */
  handedOff: boolean
  /** Tool call ids the server cancelled: no badge, no response. */
  cancelled: Set<string>
}
let turnSeq = 0
const newTurn = (): Turn => ({
  id: ++turnSeq,
  user: '',
  sync: new TranscriptSync(),
  saved: [],
  failed: [],
  modelStarted: false,
  complete: false,
  interrupted: false,
  interruptedAt: null,
  toolsPending: 0,
  lastInputAt: 0,
  handedOff: false,
  cancelled: new Set(),
})
type Tagged = SavedItem & { callId?: string }
const notCancelled = (t: Turn) => (x: Tagged) => !x.callId || !t.cancelled.has(x.callId)
const untag = ({ callId: _c, ...rest }: Tagged): SavedItem => rest

type Resources = {
  session: Session | null
  ctx: AudioContext | null
  stream: MediaStream | null
  source: MediaStreamAudioSourceNode | null
  node: AudioNode | null
  sink: AudioNode | null
  workletUrl: string | null
  sources: Set<AudioBufferSourceNode>
  tick: ReturnType<typeof setInterval> | null
}

/**
 * Hands-free Echo call on Gemini Live. The server mints a single-use token with the model, voice, 2 s silence
 * detection, transcription, system instruction and tools locked; the browser streams 16 kHz PCM16 from the mic
 * and plays 24 kHz PCM16 back gaplessly. Each finished turn is handed to `onTurn` for persistence.
 */
export function useEchoCall({
  user,
  voice,
  getContext,
  getRefs,
  onTurn,
  onLateResult,
  onDeleted,
}: {
  user: User
  voice: string
  getContext: () => EchoRequest['context']
  /** The ref map that matches the items in the last getContext() result (kept for the whole call). */
  getRefs?: () => RefMap | undefined
  onTurn: (t: CallTurn) => void
  onLateResult?: (turnId: number, r: LateResult) => void
  /** A delete made by Echo during the call (for the Undo toast). */
  onDeleted?: (e: UndoInput) => void
}) {
  const [phase, setPhase] = useState<CallPhase>('idle')
  const [muted, setMuted] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [live, setLive] = useState<LiveBubble | null>(null)
  const [error, setError] = useState<CallError | null>(null)
  const res = useRef<Resources>({ session: null, ctx: null, stream: null, source: null, node: null, sink: null, workletUrl: null, sources: new Set(), tick: null })
  const callId = useRef(0)
  const turn = useRef<Turn>(newTurn())
  const sched = useRef(new PlaybackScheduler())
  const mutedRef = useRef(false)
  const userEnded = useRef(false)
  const cb = useRef({ onTurn, onLateResult, onDeleted, getContext, getRefs, user, voice })
  useEffect(() => {
    cb.current = { onTurn, onLateResult, onDeleted, getContext, getRefs, user, voice }
  })
  const lastActivity = useRef(0)
  const limitReached = useRef(false)
  const toolCtx = useRef<{ checkInTime: string; memoryLabels: { label: string; type: string }[]; refs?: RefMap; caloriesEnabled: boolean }>({ checkInTime: '09:00', memoryLabels: [], caloriesEnabled: true })
  const lastLive = useRef('')
  // What Echo said last (a delete must follow Echo's confirmation question).
  const lastEcho = useRef('')

  const now = () => res.current.ctx?.currentTime ?? 0

  const stopPlayback = () => {
    for (const s of res.current.sources) {
      try {
        s.stop()
      } catch {}
    }
    res.current.sources.clear()
    sched.current.reset()
  }

  // Hand a finished turn to the page; `revealedOnly` keeps only what Echo actually said (barge-in / hang-up).
  const finalize = (revealedOnly: boolean) => {
    const t = turn.current
    turn.current = newTurn()
    t.handedOff = true
    const echoText = (revealedOnly || t.interrupted ? t.sync.revealed(t.interruptedAt ?? now()) : t.sync.full()).trim()
    const userText = t.user.trim()
    lastLive.current = ''
    setLive(null)
    const saved = (t.saved as Tagged[]).filter(notCancelled(t)).map(untag)
    if (echoText) lastEcho.current = echoText
    if (userText || echoText) cb.current.onTurn({ id: t.id, userText, echoText, saved, failed: t.failed })
  }

  const release = () => {
    const r = res.current
    if (r.tick) clearInterval(r.tick)
    stopPlayback()
    try {
      r.session?.close()
    } catch {}
    try {
      r.node?.disconnect()
      r.sink?.disconnect()
    } catch {}
    try {
      r.source?.disconnect()
    } catch {}
    r.stream?.getTracks().forEach((t) => t.stop())
    if (r.ctx && r.ctx.state !== 'closed') void r.ctx.close().catch(() => undefined)
    if (r.workletUrl) URL.revokeObjectURL(r.workletUrl)
    res.current = { session: null, ctx: null, stream: null, source: null, node: null, sink: null, workletUrl: null, sources: new Set(), tick: null }
  }

  const end = useCallback(() => {
    if (!res.current.session && !res.current.ctx && !res.current.stream) {
      callId.current++
      setPhase('idle')
      return
    }
    callId.current++
    userEnded.current = true
    finalize(true)
    release()
    mutedRef.current = false
    setMuted(false)
    setStartedAt(null)
    setPhase('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fail = (e: CallError) => {
    callId.current++
    finalize(true)
    release()
    mutedRef.current = false
    setMuted(false)
    setStartedAt(null)
    setPhase('idle')
    setError(e)
  }

  const tick = () => {
    const t = turn.current
    const n = now()
    const playing = sched.current.isPlaying(n)
    // Finish the turn once the model is done, every tool answered, and the audio + text have played out.
    if (t.complete && !t.toolsPending && !playing && t.sync.done(n)) {
      finalize(t.interrupted)
      setPhase((p) => (p === 'idle' || p === 'connecting' ? p : 'listening'))
      return
    }
    // Watchdog: a reply was expected but the server went quiet (lost follow-up after a tool response/cancellation).
    if (t.modelStarted && !t.complete && !t.toolsPending && !playing && Date.now() - lastActivity.current > WATCHDOG_MS) {
      t.sync.flush(n)
      finalize(true)
      setPhase((p) => (p === 'idle' || p === 'connecting' ? p : 'listening'))
      return
    }
    const echo = t.sync.revealed(t.interruptedAt ?? n)
    const shownSaved = (t.saved as Tagged[]).filter(notCancelled(t))
    const key = `${t.user}\u0000${echo}\u0000${shownSaved.length}`
    if (key !== lastLive.current) {
      lastLive.current = key
      setLive(t.user || echo || shownSaved.length ? { user: t.user, echo, saved: shownSaved } : null)
    }
    const thinking = t.toolsPending > 0 || (t.modelStarted && !t.complete) || (!!t.user && !t.modelStarted && Date.now() - t.lastInputAt > THINKING_AFTER_MS)
    const next: CallPhase = playing ? 'speaking' : thinking ? 'thinking' : 'listening'
    setPhase((p) => (p === 'idle' || p === 'connecting' ? p : next))
  }

  const handleTools = async (calls: NonNullable<LiveServerMessage['toolCall']>['functionCalls'], id: number) => {
    if (!calls?.length) return
    const t = turn.current
    t.toolsPending++
    try {
      const [{ executeToolCalls }, { makeReader }] = await Promise.all([import('@/lib/echo/live-tools'), import('@/lib/echo/live-data')])
      const uid = cb.current.user.uid
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      const tc = toolCtx.current
      const out = await executeToolCalls(
        calls,
        { clientTime: localIsoWithOffset(), ...tc, lastEchoText: lastEcho.current },
        (r) => applyActions(uid, r, { refs: tc.refs, source: 'call', onDeleted: (e) => cb.current.onDeleted?.(e), estimateMeal: (d, mt) => estimateMealViaApi(cb.current.user, d, mt) }),
        { read: makeReader(uid, tz) },
      )
      // Confirmed now; if the turn was already handed off (hang-up, barge-in, watchdog) report them as late.
      const record = (r: { saved: Tagged[]; failed: string[] }) => {
        const ok = r.saved.filter(notCancelled(t))
        if (!t.handedOff) {
          t.saved.push(...ok)
          t.failed.push(...r.failed)
        } else if (ok.length || r.failed.length) {
          cb.current.onLateResult?.(t.id, { saved: ok.map(untag), failed: r.failed })
        }
      }
      record(out as { saved: Tagged[]; failed: string[] })
      // Late outcomes: saves join the turn (or patch the persisted reply); failures always surface via onLateResult.
      void out.late.then((r) => {
        record({ saved: r.saved as Tagged[], failed: [] })
        if (r.failed.length) cb.current.onLateResult?.(t.id, { saved: [], failed: r.failed })
      })
      if (id !== callId.current) return
      const responses = out.responses.filter((r) => !r.id || !t.cancelled.has(r.id))
      if (responses.length) res.current.session?.sendToolResponse({ functionResponses: responses })
      lastActivity.current = Date.now()
      if (process.env.NODE_ENV !== 'production') {
        const w = window as unknown as { __echoCallTrace?: string[] }
        w.__echoCallTrace = [...(w.__echoCallTrace ?? []), `${Math.round(performance.now())} toolResponse`]
      }
      // The model answers the tool result in a follow-up generation; wait for its own completion.
      t.complete = false
    } catch {
      if (id === callId.current) t.failed.push('tool')
    } finally {
      t.toolsPending--
    }
  }

  const onMessage = (m: LiveServerMessage, id: number) => {
    if (id !== callId.current) return
    const sc = m.serverContent
    if (process.env.NODE_ENV !== 'production') trace(m)
    lastActivity.current = Date.now()
    const ctx = res.current.ctx
    if (m.goAway) limitReached.current = true // the server will close this connection soon
    if (sc?.interrupted && !turn.current.interrupted) {
      // Barge-in: the user started talking over Echo. Stop audio now; freeze the text at what was heard.
      turn.current.interruptedAt = now()
      turn.current.interrupted = true
      stopPlayback()
    }
    const ids = m.toolCallCancellation?.ids ?? []
    if (ids.length) {
      // Cancelled calls get no badge and no response (writes that already happened are not undone).
      for (const cid of ids) turn.current.cancelled.add(cid)
    }
    const input = sc?.inputTranscription?.text
    if (input) {
      let t = turn.current
      if (t.modelStarted && (t.interrupted || t.complete)) {
        finalize(true)
        t = turn.current
      }
      t.user += input
      t.lastInputAt = Date.now()
    }
    const parts = sc?.modelTurn?.parts ?? []
    const out = sc?.outputTranscription?.text
    // New model output after a barge-in is the next reply: close the interrupted turn so it plays normally.
    if (turn.current.interrupted && !sc?.interrupted && (out || parts.some((p) => p.inlineData?.data))) finalize(true)
    const t = turn.current
    for (const p of parts) {
      const data = p.inlineData?.data
      if (!data || !ctx) continue
      const { samples, rate } = decodeServerAudio(data, p.inlineData?.mimeType)
      if (!samples.length) continue
      const buf = ctx.createBuffer(1, samples.length, rate)
      buf.getChannelData(0).set(samples)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      const start = sched.current.schedule(ctx.currentTime, buf.duration)
      src.start(start)
      res.current.sources.add(src)
      src.onended = () => res.current.sources.delete(src)
      t.sync.audio(start)
      t.modelStarted = true
      t.complete = false
    }
    if (out) {
      t.sync.text(out)
      t.modelStarted = true
      t.complete = false
    }
    if (m.toolCall?.functionCalls?.length) {
      t.modelStarted = true
      void handleTools(m.toolCall.functionCalls, id)
    }
    if (sc?.turnComplete && t.interrupted) {
      // Interrupted generation is over: close it with what was heard, so the next reply plays normally.
      finalize(true)
      return
    }
    // A turnComplete before this turn produced anything belongs to an earlier (interrupted) generation.
    // generationComplete arrives seconds before turnComplete (the server paces that to real-time playback);
    // either one ends the turn once playback and the transcript reveal have drained.
    if ((sc?.turnComplete || sc?.generationComplete) && t.modelStarted && !t.toolsPending) {
      t.complete = true
      // Text with no audio (rare) would never reveal: show it now.
      if (!sched.current.isPlaying(now())) t.sync.flush(now())
    }
  }

  const start = useCallback(async () => {
    if (res.current.session || res.current.ctx) return
    const id = ++callId.current
    userEnded.current = false
    limitReached.current = false
    lastActivity.current = Date.now()
    setError(null)
    setPhase('connecting')
    turn.current = newTurn()
    lastLive.current = ''
    setLive(null)
    const r = res.current
    try {
      // Created inside the click so playback is allowed without another gesture.
      const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      r.ctx = new Ctx()
      if (r.ctx.state === 'suspended') void r.ctx.resume()
    } catch {
      fail({ kind: 'failed', message: 'This browser cannot play audio for calls.' })
      return
    }
    const context = cb.current.getContext()
    lastEcho.current = ''
    toolCtx.current = {
      checkInTime: extractCheckInTime(context.profile),
      memoryLabels: context.memoryLabels.map((m) => ({ label: m.label, type: m.type })),
      refs: cb.current.getRefs?.(),
      caloriesEnabled: context.items?.caloriesEnabled !== false,
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    try {
      const [stream, sess, genai] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }).catch((e) => {
          throw Object.assign(new Error('mic'), { mic: e })
        }),
        // Snapshot of goals/reminders/health for the instruction (best effort, capped wait), then the token.
        import('@/lib/echo/live-data')
          .then((m) => m.loadSnapshot(cb.current.user.uid, tz))
          .catch(() => '')
          .then((snapshot) => requestLiveSession(cb.current.user, { clientTime: localIsoWithOffset(), timeZone: tz, voice: cb.current.voice, context, snapshot })),
        import('@google/genai'),
        import('@/lib/echo/live-tools'), // warm the tools chunk for the first tool call
      ])
      if (id !== callId.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      r.stream = stream
      const ai = new genai.GoogleGenAI({ apiKey: sess.token, httpOptions: { apiVersion: 'v1alpha' } })
      const session = await ai.live.connect({
        model: sess.model,
        callbacks: {
          onmessage: (m) => onMessage(m, id),
          onerror: () => {
            if (id === callId.current) fail({ kind: 'dropped', message: 'The call dropped. Check your connection and try again.' })
          },
          onclose: (e) => {
            if (id !== callId.current || userEnded.current) return
            const reason = String((e as CloseEvent)?.reason ?? '')
            if (limitReached.current) return fail({ kind: 'limit', message: LIMIT_MESSAGE })
            fail(/quota|exhausted|429/i.test(reason) ? { kind: 'quota', message: "Echo's voice reached today's free limit. You can keep typing." } : { kind: 'dropped', message: 'The call ended unexpectedly.' })
          },
        },
      })
      if (id !== callId.current) {
        session.close()
        return
      }
      r.session = session
      await startCapture(id)
      if (id !== callId.current) return
      r.tick = setInterval(tick, TICK_MS)
      setStartedAt(Date.now())
      setPhase('listening')
      // Echo speaks first: a hidden text kickoff (no input transcription, so no user bubble); the greeting
      // arrives as a normal model turn and is saved as an assistant message.
      try {
        session.sendRealtimeInput({ text: greetingKickoff(localIsoWithOffset()) })
      } catch {}
    } catch (e) {
      if (id !== callId.current) return
      const mic = (e as { mic?: unknown })?.mic
      if (mic) fail({ kind: 'mic', message: micMessage(mic) })
      else if (e instanceof VoiceError && e.kind === 'quota') fail({ kind: 'quota', message: "Echo's voice reached today's free limit. You can keep typing." })
      else if (e instanceof VoiceError && e.kind === 'unauthorized') fail({ kind: 'failed', message: 'Please sign in again.' })
      else fail({ kind: 'failed', message: 'Could not connect the call.' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startCapture = async (id: number) => {
    const r = res.current
    const ctx = r.ctx
    const stream = r.stream
    if (!ctx || !stream) throw new Error('no audio')
    const source = ctx.createMediaStreamSource(stream)
    r.source = source
    const enc = new CaptureEncoder(ctx.sampleRate)
    const onBlock = (block: Float32Array) => {
      if (id !== callId.current || mutedRef.current || !r.session) return
      for (const data of enc.push(block)) r.session.sendRealtimeInput({ audio: { data, mimeType: INPUT_MIME } })
    }
    if (ctx.audioWorklet) {
      try {
        r.workletUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
        await ctx.audioWorklet.addModule(r.workletUrl)
        const node = new AudioWorkletNode(ctx, 'echo-call-capture')
        node.port.onmessage = (e: MessageEvent<Float32Array>) => onBlock(e.data)
        source.connect(node)
        // Safari only pulls a worklet that reaches the destination; a zero gain keeps it silent.
        const mute = ctx.createGain()
        mute.gain.value = 0
        node.connect(mute)
        mute.connect(ctx.destination)
        r.node = node
        r.sink = mute
        return
      } catch {
        if (r.workletUrl) URL.revokeObjectURL(r.workletUrl)
        r.workletUrl = null
      }
    }
    // Fallback: ScriptProcessor (deprecated but universal). Its output stays silent.
    const node = ctx.createScriptProcessor(2048, 1, 1)
    node.onaudioprocess = (e) => {
      onBlock(new Float32Array(e.inputBuffer.getChannelData(0)))
      e.outputBuffer.getChannelData(0).fill(0)
    }
    source.connect(node)
    node.connect(ctx.destination)
    r.node = node
  }

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    res.current.stream?.getAudioTracks().forEach((t) => (t.enabled = !next))
    // Let the server's activity detection close the user's turn right away.
    if (next) {
      try {
        res.current.session?.sendRealtimeInput({ audioStreamEnd: true })
      } catch {}
    }
  }, [])

  const active = phase !== 'idle'

  // Esc ends the call.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, end])

  // Always release the mic, audio and socket on unmount (page switch, sign-out, navigation).
  useEffect(() => end, [end])

  return { phase, active, muted, startedAt, live, error, start, end, toggleMute, clearError: () => setError(null) }
}

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: '',
  connecting: 'Connecting...',
  listening: 'Listening',
  thinking: 'Echo is thinking...',
  speaking: 'Echo is speaking',
}

export function callMarkState(phase: CallPhase, muted: boolean): EchoMarkState {
  if (phase === 'speaking') return 'speaking'
  if (phase === 'thinking' || phase === 'connecting') return 'thinking'
  if (phase === 'listening' && !muted) return 'listening'
  return 'idle'
}

function Elapsed({ since }: { since: number | null }) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [since])
  return <span className="text-xs tabular-nums text-muted-foreground">{since ? formatElapsed(Date.now() - since) : '0:00'}</span>
}

/**
 * Full-screen call view for touch layouts (< lg): large Echo mark, state text, scrolling live transcript (children),
 * and big Mute / End buttons at the bottom within thumb reach. Desktop keeps the CallBar.
 */
export function CallScreen({ phase, muted, startedAt, onMute, onEnd, scrollKey, children, alerts, onClosed }: { phase: CallPhase; muted: boolean; startedAt: number | null; onMute: () => void; onEnd: () => void; scrollKey: string; children: ReactNode; alerts?: ReactNode; onClosed?: () => void }) {
  const status = muted && phase === 'listening' ? 'Muted' : PHASE_LABEL[phase]
  const scroller = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closedRef = useRef(onClosed)
  closedRef.current = onClosed
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [scrollKey, alerts])
  useEffect(() => {
    // Only move focus when this view is actually shown (it is display:none at >= lg).
    const shown = !!endRef.current?.offsetParent
    if (shown) endRef.current?.focus({ preventScroll: true })
    // After the call, hand focus back (Home focuses its Call button once the composer is back).
    return () => {
      if (shown) requestAnimationFrame(() => closedRef.current?.())
    }
  }, [])
  // Focus trap: Tab and Shift+Tab cycle inside the call view.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'))
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (!panel.current.contains(document.activeElement)) {
      e.preventDefault()
      first.focus()
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  const round = `grid size-18 place-items-center rounded-full border transition-colors disabled:opacity-50 ${FOCUS_RING}`
  return (
    <div ref={panel} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label="Call with Echo" className="fixed inset-0 z-50 flex flex-col bg-background pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex h-12 shrink-0 items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Call with Echo</span>
        <span aria-hidden="true">·</span>
        <Elapsed since={startedAt} />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-3 px-6 pb-4 pt-4">
        <EchoMark state={callMarkState(phase, muted)} />
        <p role="status" aria-live="polite" className="mt-2 text-lg font-semibold text-foreground">
          {status}
        </p>
        <p className="text-center text-sm text-muted-foreground">Echo replies after 2 s of silence.</p>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto border-t border-border">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4">{children}</div>
      </div>
      {alerts && <div className="grid shrink-0 gap-2 border-t border-border px-4 py-3">{alerts}</div>}
      <div className="flex shrink-0 items-start justify-center gap-16 border-t border-border px-6 pb-6 pt-5">
        <div className="flex flex-col items-center gap-2">
          <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onClick={onMute} disabled={phase === 'connecting'} className={`${round} ${muted ? 'border-foreground bg-foreground text-background' : 'border-border-strong bg-surface-2 text-foreground active:bg-surface'}`}>
            {muted ? <MicOff size={28} aria-hidden="true" /> : <Mic size={28} aria-hidden="true" />}
          </button>
          <span aria-hidden="true" className="text-xs text-muted-foreground">{muted ? 'Unmute' : 'Mute'}</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button ref={endRef} type="button" aria-label="End call" onClick={onEnd} className={`${round} border-transparent bg-danger text-background active:bg-danger/90`}>
            <PhoneOff size={28} aria-hidden="true" />
          </button>
          <span aria-hidden="true" className="text-xs text-muted-foreground">End</span>
        </div>
      </div>
    </div>
  )
}

/** In-call bar: Echo mark state, status, elapsed time, Mute and End. Replaces the composer row during a call. */
export function CallBar({ phase, muted, startedAt, onMute, onEnd }: { phase: CallPhase; muted: boolean; startedAt: number | null; onMute: () => void; onEnd: () => void }) {
  const status = muted && phase === 'listening' ? 'Muted' : PHASE_LABEL[phase]
  return (
    <div className="flex items-center gap-3">
      <EchoMark small state={callMarkState(phase, muted)} />
      <div className="min-w-0 flex-1">
        <p role="status" aria-live="polite" className="text-sm font-medium text-foreground">
          {status}
        </p>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Elapsed since={startedAt} />
          <span aria-hidden="true">·</span>
          <span className="truncate">Echo replies after 2 s of silence. Esc ends the call.</span>
        </p>
      </div>
      <IconButton icon={muted ? MicOff : Mic} label={muted ? 'Unmute' : 'Mute'} variant="secondary" aria-pressed={muted} onClick={onMute} disabled={phase === 'connecting'} />
      <Button variant="danger" icon={PhoneOff} onClick={onEnd}>
        End
      </Button>
    </div>
  )
}
