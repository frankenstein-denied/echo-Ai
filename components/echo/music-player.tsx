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
import { isEndedMessage, queueReducer, type QueueState } from '@/lib/echo/playlists'
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
  /** Reopens the current song paused (e.g. a call started). */
  pause: () => void
  close: () => void
  /** A player command from Echo (chat or call): what it did, or why it couldn't. */
  control: (command: MusicCommand) => ControlResult
}

const noop = () => undefined
const NOOP: MusicPlayerApi = { available: false, track: null, queue: { tracks: [], index: 0 }, play: noop, playTracks: noop, enqueue: noop, next: noop, prev: noop, jump: noop, remove: noop, pause: noop, close: noop, control: () => 'unavailable' }
const MusicPlayerContext = createContext<MusicPlayerApi | null>(null)
const EMPTY: QueueState = { tracks: [], index: 0, autoplay: false, key: 0, cause: 'user' }

/** The shell's player; outside the provider it is a no-op (nothing opens). */
export function useMusicPlayer(): MusicPlayerApi {
  return useContext(MusicPlayerContext) ?? NOOP
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [q, dispatch] = useReducer(queueReducer, EMPTY)
  // A new key remounts the iframe, so asking for the same song again starts it over.
  const play = useCallback((t: MusicTrack, opts: { autoplay: boolean }) => dispatch({ type: 'play', tracks: [t], start: 0, autoplay: opts.autoplay }), [])
  const playTracks = useCallback((tracks: MusicTrack[], opts: { start?: number; autoplay?: boolean } = {}) => dispatch({ type: 'play', tracks, start: opts.start ?? 0, autoplay: opts.autoplay ?? true }), [])
  const enqueue = useCallback((tracks: MusicTrack[]) => dispatch({ type: 'enqueue', tracks }), [])
  const next = useCallback(() => dispatch({ type: 'next' }), [])
  const prev = useCallback(() => dispatch({ type: 'prev' }), [])
  const jump = useCallback((index: number) => dispatch({ type: 'jump', index }), [])
  const remove = useCallback((index: number) => dispatch({ type: 'remove', index }), [])
  const pause = useCallback(() => dispatch({ type: 'pause' }), [])
  const close = useCallback(() => dispatch({ type: 'close' }), [])
  const ended = useCallback((key: number) => dispatch({ type: 'ended', key }), [])
  // The docked player registers how to send YouTube player commands (pause/resume) to its embed.
  const sendRef = useRef<((func: 'pauseVideo' | 'playVideo') => void) | null>(null)
  const registerSender = useCallback((send: ((func: 'pauseVideo' | 'playVideo') => void) | null) => {
    sendRef.current = send
  }, [])
  const control = useCallback(
    (command: MusicCommand): ControlResult => {
      if (!q.tracks[q.index]) return 'nothing_playing'
      switch (command) {
        case 'next':
          if (q.index + 1 >= q.tracks.length) return 'no_next'
          dispatch({ type: 'next' })
          return 'ok'
        case 'previous':
          if (q.index === 0) return 'no_previous'
          dispatch({ type: 'prev' })
          return 'ok'
        case 'pause':
        case 'resume':
          // Without the embed's channel, reopening covers pause (paused) and resume (playing).
          if (sendRef.current) sendRef.current(command === 'pause' ? 'pauseVideo' : 'playVideo')
          else if (command === 'pause') dispatch({ type: 'pause' })
          else dispatch({ type: 'jump', index: q.index })
          return 'ok'
        case 'stop':
          dispatch({ type: 'close' })
          return 'ok'
        case 'shuffle':
          dispatch({ type: 'shuffleRest' })
          return 'ok'
      }
    },
    [q.tracks, q.index],
  )
  const current = q.tracks[q.index]
  const track = useMemo<PlayerTrack | null>(() => (current ? { ...current, autoplay: q.autoplay, key: q.key, cause: q.cause } : null), [current, q.autoplay, q.key, q.cause])
  const queue = useMemo(() => ({ tracks: q.tracks, index: q.index }), [q.tracks, q.index])
  const api = useMemo(
    () => ({ available: true, track, queue, play, playTracks, enqueue, next, prev, jump, remove, pause, close, control }),
    [track, queue, play, playTracks, enqueue, next, prev, jump, remove, pause, close, control],
  )
  return (
    <MusicPlayerContext.Provider value={api}>
      {children}
      {track && <DockedPlayer track={track} position={q.index + 1} total={q.tracks.length} onPrev={prev} onNext={next} onEnded={ended} onClose={close} onRegister={registerSender} />}
    </MusicPlayerContext.Provider>
  )
}

function DockedPlayer({ track, position, total, onPrev, onNext, onEnded, onClose, onRegister }: { track: PlayerTrack; position: number; total: number; onPrev: () => void; onNext: () => void; onEnded: (key: number) => void; onClose: () => void; onRegister: (send: ((func: 'pauseVideo' | 'playVideo') => void) | null) => void }) {
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
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      if (isEndedMessage(e.data)) onEnded(key)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onEnded, key])

  // Let the provider pause/resume this embed (YouTube's postMessage commands).
  useEffect(() => {
    onRegister((func) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube-nocookie.com'))
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
