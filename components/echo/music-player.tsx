'use client'

/**
 * Docked music player: one YouTube embed (youtube-nocookie, unmodified player) mounted once in the app shell so it
 * survives view changes. MusicPlayerProvider holds the current track; useMusicPlayer().play() replaces it (one player
 * at a time). Typed chat opens it with autoplay (the send tap is the gesture; if the browser blocks it, the embed shows
 * its own play button); calls open it paused. Sits above the mobile tab bar and composer, bottom-right on desktop.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ExternalLink, Music, X } from 'lucide-react'
import { youtubeEmbedUrl, youtubeMusicUrl } from '@/lib/echo/music'
import type { MusicTrack } from '@/lib/echo/music-play'
import { buttonClass } from '@/lib/echo/ui-classes'
import { IconButton } from './ui'

type PlayerTrack = MusicTrack & { autoplay: boolean; key: number }
type MusicPlayerApi = { track: PlayerTrack | null; play: (track: MusicTrack, opts: { autoplay: boolean }) => void; close: () => void }

const NOOP: MusicPlayerApi = { track: null, play: () => undefined, close: () => undefined }
const MusicPlayerContext = createContext<MusicPlayerApi | null>(null)

/** The shell's player; outside the provider it is a no-op (nothing opens). */
export function useMusicPlayer(): MusicPlayerApi {
  return useContext(MusicPlayerContext) ?? NOOP
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<PlayerTrack | null>(null)
  const play = useCallback((t: MusicTrack, opts: { autoplay: boolean }) => {
    // A new key remounts the iframe, so asking for the same song again starts it over.
    setTrack((prev) => ({ ...t, autoplay: opts.autoplay, key: (prev?.key ?? 0) + 1 }))
  }, [])
  const close = useCallback(() => setTrack(null), [])
  const api = useMemo(() => ({ track, play, close }), [track, play, close])
  return (
    <MusicPlayerContext.Provider value={api}>
      {children}
      {track && <DockedPlayer track={track} onClose={close} />}
    </MusicPlayerContext.Provider>
  )
}

function DockedPlayer({ track, onClose }: { track: PlayerTrack; onClose: () => void }) {
  return (
    <section
      aria-label="Music player"
      className="fixed right-3 z-30 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg bottom-[calc(var(--tabbar-h)+var(--kb)+5rem)] mr-[env(safe-area-inset-right)] lg:right-6 lg:bottom-24 lg:mr-0 lg:w-72"
    >
      <div className="flex items-center gap-2 py-1 pl-3 pr-1">
        <Music size={16} aria-hidden="true" className="shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={track.title}>
          {track.title}
        </p>
        <IconButton icon={X} label="Close player" size="sm" onClick={onClose} />
      </div>
      <div className="aspect-video w-full bg-black">
        <iframe
          key={track.key}
          src={youtubeEmbedUrl(track.videoId, track.autoplay)}
          title={`YouTube player: ${track.title}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="size-full border-0"
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        {track.channel ? <p className="min-w-0 truncate text-xs text-muted-foreground">{track.channel}</p> : <span />}
        <a href={youtubeMusicUrl(track.videoId)} target="_blank" rel="noopener" className={buttonClass('secondary', 'sm', 'shrink-0 gap-1.5')}>
          <ExternalLink size={16} aria-hidden="true" />
          Open in app
        </a>
      </div>
    </section>
  )
}
