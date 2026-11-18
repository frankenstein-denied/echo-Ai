'use client'

/**
 * Docked music player: one YouTube embed (youtube-nocookie, unmodified player) mounted once in the app shell so it
 * survives view changes. MusicPlayerProvider holds the queue ("Up next"); play() starts one song, playTracks() a list,
 * enqueue() adds to the end. When a song ends the next one starts (the embed reports its state via postMessage).
 * Typed chat and the Music page open it with autoplay; calls open it paused. Sits above the mobile tab bar and composer,
 * bottom-right on desktop.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Music, SkipBack, SkipForward, X } from 'lucide-react'
import { youtubeEmbedUrl, youtubeMusicUrl } from '@/lib/echo/music'
import type { MusicTrack } from '@/lib/echo/music-play'
import { isEndedMessage, queueReducer, readPlayerTime, type QueueAction, type QueueState } from '@/lib/echo/playlists'
import { isPausedMessage, isPlayingMessage, listenOutcome } from '@/lib/echo/listening'
import { finishListen, startListen } from '@/lib/firestore'
import { setNativeChatheadMood } from '@/lib/native/echo-bridge'
import type { ControlResult } from '@/lib/echo/music-play'
import type { MusicCommand } from '@/lib/echo/types'
import { buttonClass } from '@/lib/echo/ui-classes'
import { IconButton } from './ui'

type PlayerTrack = MusicTrack & { autoplay: boolean; key: number; cause: 'user' | 'ended' }
type MusicPlayerApi = {
  /** False outside the provider (e.g. the floating chathead), where nothing can play. */
  available: boolean
  /** The current song, or null when the player is closed. */
  track: PlayerTrack | null
  queue: { tracks: MusicTrack[]; index: number }
  play: (track: MusicTrack, opts: { autoplay: boolean }) => void
  playTracks: (tracks: MusicTrack[], opts?: { start?: number; autoplay?: boolean }) => void
  enqueue: (tracks: MusicTrack[]) => void
  next: () => void
  prev: () => void
  jump: (index: number) => void
  remove: (index: number) => void
  /** Reopens the current song paused. */
  pause: () => void
  /** A call started: reopens the song paused without counting it as skipped. */
  interrupt: () => void
  close: () => void
  /** A player command from Echo (chat or call): what it did, or why it couldn't. In a call, songs open paused. */
  control: (command: MusicCommand, opts?: { inCall?: boolean; seconds?: number }) => ControlResult
  nowPlaying: () => { now_playing?: string; up_next?: string[] }
}

/** The docked player's embed: send a YouTube command; ready once the embed has answered (it's listening). */
type Embed = { send: (func: 'pauseVideo' | 'playVideo') => void; seek: (seconds: number) => void; time: () => { currentTime: number; duration?: number } | null; ready: () => boolean }

const noop = () => undefined
const NOOP: MusicPlayerApi = { available: false, track: null, queue: { tracks: [], index: 0 }, play: noop, playTracks: noop, enqueue: noop, next: noop, prev: noop, jump: noop, remove: noop, pause: noop, close: noop, interrupt: noop, control: () => 'unavailable', nowPlaying: () => ({}) }
const MusicPlayerContext = createContext<MusicPlayerApi | null>(null)
const EMPTY: QueueState = { tracks: [], index: 0, autoplay: false, key: 0, cause: 'user' }

/** The shell's player; outside the provider it is a no-op (nothing opens). */
export function useMusicPlayer(): MusicPlayerApi {
  return useContext(MusicPlayerContext) ?? NOOP
}

/** `uid` turns on the listening history (the music pattern analyzer): each song YouTube reports playing is recorded. */
export function MusicPlayerProvider({ uid, children }: { uid?: string; children: ReactNode }) {
  const [q, dispatch] = useReducer(queueReducer, EMPTY)
  // qRef mirrors the queue synchronously (same reducer, same actions), so a command run seconds after a send, or two
  // call tools in one batch, see the queue as it is now, not as it was when the callback was made.
  const qRef = useRef<QueueState>(EMPTY)
  const act = useCallback((a: QueueAction) => {
    qRef.current = queueReducer(qRef.current, a)
    dispatch(a)
  }, [])
  // A new key remounts the iframe, so asking for the same song again starts it over.
  const play = useCallback((t: MusicTrack, opts: { autoplay: boolean }) => act({ type: 'play', tracks: [t], start: 0, autoplay: opts.autoplay }), [act])
  const playTracks = useCallback((tracks: MusicTrack[], opts: { start?: number; autoplay?: boolean } = {}) => act({ type: 'play', tracks, start: opts.start ?? 0, autoplay: opts.autoplay ?? true }), [act])
  const enqueue = useCallback((tracks: MusicTrack[]) => act({ type: 'enqueue', tracks }), [act])
  const next = useCallback(() => act({ type: 'next' }), [act])
  const prev = useCallback(() => act({ type: 'prev' }), [act])
  const jump = useCallback((index: number) => act({ type: 'jump', index }), [act])
  const remove = useCallback((index: number) => act({ type: 'remove', index }), [act])
  const pause = useCallback(() => act({ type: 'pause' }), [act])
  const close = useCallback(() => act({ type: 'close' }), [act])
  // ---- listening history: one doc per song that actually played; its outcome is written when it leaves ----
  // Only time spent playing counts (pauses inside the embed stop the clock). `interrupted` marks a call taking over.
  type Log = { key: number; id: Promise<string | null>; playedMs: number; since: number | null; ended: boolean; interrupted: boolean }
  const logRef = useRef<Log | null>(null)
  const finalize = useCallback(() => {
    const l = logRef.current
    if (!l || !uid) return
    logRef.current = null
    const sec = (l.playedMs + (l.since !== null ? Date.now() - l.since : 0)) / 1000
    void l.id.then((id) => (id ? finishListen(uid, id, listenOutcome(l.ended, sec, l.interrupted), sec) : undefined)).catch(() => undefined)
  }, [uid])
  const playing = useCallback(
    (key: number) => {
      setNativeChatheadMood({ musicPlaying: true }) // the chathead bobs along
      if (!uid) return
      const l = logRef.current
      // The same song playing on after a pause: just restart the clock. A replay after it ended is a new play.
      if (l?.key === key && !l.ended) {
        if (l.since === null) l.since = Date.now()
        return
      }
      const s = qRef.current
      const t = s.key === key ? s.tracks[s.index] : undefined
      if (!t) return
      finalize()
      logRef.current = { key, id: startListen(uid, t).catch(() => null), playedMs: 0, since: Date.now(), ended: false, interrupted: false }
    },
    [uid, finalize],
  )
  const paused = useCallback((key: number) => {
    setNativeChatheadMood({ musicPlaying: false })
    const l = logRef.current
    if (l?.key === key && l.since !== null) {
      l.playedMs += Date.now() - l.since
      l.since = null
    }
  }, [])
  // A song leaves the player when the queue moves on or closes, the provider unmounts, or the page is hidden.
  useEffect(() => {
    if (logRef.current && logRef.current.key !== q.key) finalize()
  }, [q.key, finalize])
  useEffect(() => {
    window.addEventListener('pagehide', finalize)
    return () => {
      window.removeEventListener('pagehide', finalize)
      finalize()
    }
  }, [finalize])
  const ended = useCallback(
    (key: number) => {
      const l = logRef.current
      if (l?.key === key) {
        l.ended = true
        // The last song in the queue doesn't move on, so close its record now.
        const s = qRef.current
        if (s.key === key && s.index + 1 >= s.tracks.length) finalize()
      }
      act({ type: 'ended', key })
    },
    [act, finalize],
  )
  /** A call started: reopen the song paused; its record ends as partly played, never as a skip. */
  const interrupt = useCallback(() => {
    if (logRef.current) logRef.current.interrupted = true
    act({ type: 'pause' })
  }, [act])
  // The docked player registers how to command its embed, and whether the embed has answered yet (is listening).
  const embedRef = useRef<Embed | null>(null)
  const registerEmbed = useCallback((e: Embed | null) => {
    embedRef.current = e
  }, [])
  const control = useCallback(
    (command: MusicCommand, opts: { inCall?: boolean; seconds?: number } = {}): ControlResult => {
      const s = qRef.current
      if (!s.tracks[s.index]) return 'nothing_playing'
      const embed = embedRef.current?.ready() ? embedRef.current : null
      switch (command) {
        case 'next':
          if (s.index + 1 >= s.tracks.length) return 'no_next'
          // In a call the next song opens paused: never over Echo's voice.
          act({ type: 'next', autoplay: !opts.inCall })
          return 'ok'
        case 'previous':
          if (s.index === 0) return 'no_previous'
          act({ type: 'prev', autoplay: !opts.inCall })
          return 'ok'
        case 'pause':
          // An embed that hasn't answered yet would drop the command: reopen the song paused instead.
          if (embed) embed.send('pauseVideo')
          else act({ type: 'pause' })
          return 'ok'
        case 'resume':
          if (opts.inCall) return 'in_call'
          if (embed) embed.send('playVideo')
          else act({ type: 'jump', index: s.index })
          return 'ok'
        case 'stop':
          act({ type: 'close' })
          return 'ok'
        case 'shuffle':
          if (s.tracks.length - s.index - 1 < 2) return 'no_shuffle'
          act({ type: 'shuffleRest' })
          return 'ok'
        case 'forward':
        case 'back':
        case 'restart': {
          // Seeking needs the embed's channel and a known position (it reports one while playing).
          const at = embed?.time()
          if (!embed || (command !== 'restart' && !at)) return 'cant_seek'
          const step = opts.seconds ?? 10
          const to = command === 'restart' ? 0 : (at?.currentTime ?? 0) + (command === 'forward' ? step : -step)
          const end = at?.duration
          // Jumping past the end goes to the next song, or stops just before the end of the last one.
          if (end && to >= end - 1) {
            if (s.index + 1 < s.tracks.length) {
              act({ type: 'next', autoplay: !opts.inCall })
              return 'ok'
            }
            embed.seek(Math.max(0, end - 2))
            return 'ok'
          }
          embed.seek(Math.max(0, to))
          return 'ok'
        }
      }
    },
    [act],
  )
  /** What's playing and next right now (for a call's tool result, which is fresher than the call's MUSIC block). */
  const nowPlaying = useCallback((): { now_playing?: string; up_next?: string[] } => {
    const s = qRef.current
    const cur = s.tracks[s.index]
    return cur ? { now_playing: cur.title, up_next: s.tracks.slice(s.index + 1, s.index + 4).map((x) => x.title) } : {}
  }, [])
  const current = q.tracks[q.index]
  const track = useMemo<PlayerTrack | null>(() => (current ? { ...current, autoplay: q.autoplay, key: q.key, cause: q.cause } : null), [current, q.autoplay, q.key, q.cause])
  // Player closed (or gone): the chathead stops bobbing.
  const hasTrack = !!current
  useEffect(() => {
    if (!hasTrack) setNativeChatheadMood({ musicPlaying: false })
  }, [hasTrack])
  const queue = useMemo(() => ({ tracks: q.tracks, index: q.index }), [q.tracks, q.index])
  const api = useMemo(
    () => ({ available: true, track, queue, play, playTracks, enqueue, next, prev, jump, remove, pause, close, interrupt, control, nowPlaying }),
    [track, queue, play, playTracks, enqueue, next, prev, jump, remove, pause, close, interrupt, control, nowPlaying],
  )
  return (
    <MusicPlayerContext.Provider value={api}>
      {children}
      {track && <DockedPlayer track={track} position={q.index + 1} total={q.tracks.length} onPrev={prev} onNext={next} onEnded={ended} onPlaying={playing} onPaused={paused} onClose={close} onRegister={registerEmbed} />}
    </MusicPlayerContext.Provider>
  )
}

function DockedPlayer({ track, position, total, onPrev, onNext, onEnded, onPlaying, onPaused, onClose, onRegister }: { track: PlayerTrack; position: number; total: number; onPrev: () => void; onNext: () => void; onEnded: (key: number) => void; onPlaying: (key: number) => void; onPaused: (key: number) => void; onClose: () => void; onRegister: (embed: Embed | null) => void }) {
  // Minimized keeps the iframe mounted (hidden), so the song keeps playing while the player stops covering the page.
  const [minimized, setMinimized] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const origin = typeof window === 'undefined' ? undefined : window.location.origin

  // A song the user started opens the player un-minimized (so a blocked autoplay's play button is visible);
  // auto-advance to the next song leaves it as it was.
  const [shownKey, setShownKey] = useState(track.key)
  if (shownKey !== track.key) {
    setShownKey(track.key)
    if (track.cause === 'user') setMinimized(false)
  }

  // When this song's embed says it ended, play the next one. The key makes a repeated "ended" a no-op.
  const key = track.key
  // The key of the embed that last answered; commands go to the embed only once the current one has.
  const answered = useRef(-1)
  // The latest playback position the embed reported, per song.
  const timeRef = useRef<{ key: number; at: { currentTime: number; duration?: number } } | null>(null)
  const keyRef = useRef(key)
  useEffect(() => {
    keyRef.current = key
  }, [key])
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      // Any message from this embed means its player is up and listening for commands.
      answered.current = key
      const at = readPlayerTime(e.data)
      if (at) timeRef.current = { key, at }
      if (isEndedMessage(e.data)) onEnded(key)
      else if (isPlayingMessage(e.data)) onPlaying(key)
      else if (isPausedMessage(e.data)) onPaused(key)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onEnded, onPlaying, onPaused, key])

  // Let the provider pause/resume this embed (YouTube's postMessage commands).
  useEffect(() => {
    const post = (func: string, args: unknown[]) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube-nocookie.com')
    onRegister({
      send: (func) => post(func, []),
      seek: (seconds) => post('seekTo', [seconds, true]),
      time: () => (timeRef.current && timeRef.current.key === keyRef.current ? timeRef.current.at : null),
      ready: () => answered.current === keyRef.current,
    })
    return () => onRegister(null)
  }, [onRegister])

  // Ask the embed to report its state (YouTube's iframe postMessage protocol). Its player may start after the
  // iframe's load event, so ask a few times.
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [key])
  const listen = () => {
    const send = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: key, channel: 'widget' }), 'https://www.youtube-nocookie.com')
    send()
    timers.current = [1000, 2500, 5000].map((ms) => window.setTimeout(send, ms))
  }

  return (
    <section
      aria-label="Music player"
      className="fixed right-3 z-30 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg bottom-[calc(var(--tabbar-h)+var(--kb)+5rem)] mr-[env(safe-area-inset-right)] lg:right-6 lg:bottom-24 lg:mr-0 lg:w-72"
    >
      <div className="flex items-center gap-1 py-1 pl-3 pr-1">
        <Music size={16} aria-hidden="true" className="shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={track.title}>
          {track.title}
        </p>
        <IconButton icon={minimized ? ChevronUp : ChevronDown} label={minimized ? 'Show player' : 'Minimize player'} size="sm" onClick={() => setMinimized((m) => !m)} />
        <IconButton icon={X} label="Close player" size="sm" onClick={onClose} />
      </div>
      <div className="aspect-video w-full bg-black" hidden={minimized}>
        <iframe
          key={track.key}
          ref={frame}
          onLoad={listen}
          src={youtubeEmbedUrl(track.videoId, track.autoplay, origin)}
          title={`YouTube player: ${track.title}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="size-full border-0"
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-2 py-2" hidden={minimized}>
        {total > 1 ? (
          <div className="flex items-center gap-1">
            <IconButton icon={SkipBack} label="Previous song" size="sm" onClick={onPrev} disabled={position <= 1} />
            <span className="text-xs tabular-nums text-muted-foreground">
              <span aria-hidden="true">
                {position}/{total}
              </span>
              <span className="sr-only">
                Song {position} of {total}
              </span>
            </span>
            <IconButton icon={SkipForward} label="Next song" size="sm" onClick={onNext} disabled={position >= total} />
          </div>
        ) : track.channel ? (
          <p className="min-w-0 truncate px-1 text-xs text-muted-foreground">{track.channel}</p>
        ) : (
          <span />
        )}
        {/* With next/previous on a narrow phone player, the link shows only its icon. */}
        <a href={youtubeMusicUrl(track.videoId)} target="_blank" rel="noopener noreferrer" aria-label="Open in app" className={buttonClass('secondary', 'sm', 'shrink-0 gap-1.5')}>
          <ExternalLink size={16} aria-hidden="true" />
          <span className={total > 1 ? 'max-lg:hidden' : ''}>Open in app</span>
        </a>
      </div>
    </section>
  )
}
