'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { floatToPcm16, INPUT_RATE, pcm16ToWav, rmsLevel, StreamingDownsampler } from '@/lib/echo/call-audio'
import { DICTATION_MESSAGES, heardSomething, MAX_DICTATION_MS, micErrorMessage } from '@/lib/echo/dictation'
import { transcribe } from '@/lib/echo/voice-client'

export type DictationState = 'idle' | 'recording' | 'transcribing' | 'error'

type Rec = {
  stream: MediaStream
  ctx: AudioContext
  source: MediaStreamAudioSourceNode
  node: ScriptProcessorNode
  chunks: Int16Array[]
  samples: number
  peak: number
  timer: ReturnType<typeof setTimeout>
}

/**
 * Dictation for any text box: records 16 kHz mono WAV, stops itself at 60 s, and turns it into text with the
 * transcribe route (Android WebView has no Web Speech API). A denied mic, silence or a failed request ends in
 * state 'error' with a short `error`; the caller's text box keeps working either way.
 * `onAutoStop` gets the text when a recording reaches the 60 s cap (a stop() by the user returns it instead).
 */
export function useDictation(user: Pick<User, 'getIdToken'>, opts: { onAutoStop?: (text: string) => void } = {}) {
  const [state, setState] = useState<DictationState>('idle')
  const [error, setError] = useState('')
  const [level, setLevel] = useState(0)
  const rec = useRef<Rec | null>(null)
  const starting = useRef(false)
  const alive = useRef(true)
  const userRef = useRef(user)
  const onAutoStop = useRef(opts.onAutoStop)
  useEffect(() => {
    userRef.current = user
    onAutoStop.current = opts.onAutoStop
  })

  const teardown = useCallback((): Rec | null => {
    const r = rec.current
    rec.current = null
    if (!r) return null
    clearTimeout(r.timer)
    r.node.onaudioprocess = null
    try {
      r.source.disconnect()
      r.node.disconnect()
    } catch {}
    r.stream.getTracks().forEach((t) => t.stop())
    void r.ctx.close().catch(() => undefined)
    return r
  }, [])

  const fail = useCallback((message: string) => {
    if (!alive.current) return
    setError(message)
    setState('error')
    setLevel(0)
  }, [])

  const stop = useCallback(async (): Promise<string> => {
    const r = teardown()
    if (!r) return ''
    setLevel(0)
    if (!heardSomething(r.samples, r.peak)) {
      fail(DICTATION_MESSAGES.silent)
      return ''
    }
    setState('transcribing')
    const pcm = new Int16Array(r.samples)
    let at = 0
    for (const c of r.chunks) {
      pcm.set(c, at)
      at += c.length
    }
    try {
      const text = await transcribe(userRef.current, new Blob([pcm16ToWav(pcm, INPUT_RATE) as BlobPart], { type: 'audio/wav' }))
      if (!text) {
        fail(DICTATION_MESSAGES.empty)
        return ''
      }
      if (alive.current) setState('idle')
      return text
    } catch (e) {
      fail(e instanceof Error && e.message ? e.message : DICTATION_MESSAGES.empty)
      return ''
    }
  }, [teardown, fail])

  const start = useCallback(async (): Promise<void> => {
    if (rec.current || starting.current) return
    setError('')
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      fail(DICTATION_MESSAGES.unsupported)
      return
    }
    starting.current = true
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
    } catch (e) {
      starting.current = false
      fail(micErrorMessage(e))
      return
    }
    starting.current = false
    if (!alive.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    try {
      const ctx = new AudioContext()
      void ctx.resume().catch(() => undefined)
      const source = ctx.createMediaStreamSource(stream)
      // ScriptProcessor is deprecated but works in every WebView; its output stays silent.
      const node = ctx.createScriptProcessor(4096, 1, 1)
      const ds = new StreamingDownsampler(ctx.sampleRate, INPUT_RATE)
      const r: Rec = { stream, ctx, source, node, chunks: [], samples: 0, peak: 0, timer: setTimeout(() => void autoStop(), MAX_DICTATION_MS) }
      node.onaudioprocess = (e) => {
        const block = new Float32Array(e.inputBuffer.getChannelData(0))
        e.outputBuffer.getChannelData(0).fill(0)
        const lv = rmsLevel(block)
        r.peak = Math.max(r.peak, lv)
        const pcm = floatToPcm16(ds.push(block))
        r.chunks.push(pcm)
        r.samples += pcm.length
        setLevel(lv)
      }
      source.connect(node)
      node.connect(ctx.destination)
      rec.current = r
      setState('recording')
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      fail(DICTATION_MESSAGES.failed)
    }
    async function autoStop() {
      const text = await stop()
      if (text) onAutoStop.current?.(text)
    }
  }, [fail, stop])

  const cancel = useCallback(() => {
    teardown()
    setLevel(0)
    setError('')
    setState('idle')
  }, [teardown])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      teardown()
    }
  }, [teardown])

  return { state, error, level, start, stop, cancel }
}
