'use client'

/**
 * Music page: a "play something, or paste a link" box (links play at once, a song or playlist name is searched, the
 * usual plays from the listening patterns, anything else goes to Echo), "your usual now", playlists as covers,
 * recently played, and a slim now-playing card that opens the queue and listening stats. Playback is the shell's
 * docked player (useMusicPlayer). Titles of pasted links come from YouTube's oEmbed (no key).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { ArrowUp, BarChart3, ListMusic, Loader2, Mic, Pencil, Play, Plus, Shuffle, SkipBack, SkipForward, Square, Trash2, X } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { clearListens, createPlaylist, deletePlaylist, listensCol, playlistsCol, renamePlaylist, updatePlaylistTracks, type UserProfile } from '@/lib/firestore'
import { analyzeListening, LISTEN_WINDOW_DAYS, toListen, type Listen, type ListeningAnalysis } from '@/lib/echo/listening'
import { isPermissionDenied, RULES_MESSAGE } from '@/lib/echo/diary'
import { fetchVideoInfo } from '@/lib/echo/music'
import { findMusic, findTrack, type MusicTrack } from '@/lib/echo/music-play'
import { musicBoxIntent, musicLine, usualNow, type UsualNow } from '@/lib/echo/page-lines'
import { addTracks, cleanPlaylistName, parseYoutubeLinks, PLAYLIST_LIMITS, playlistNameTaken, shuffled, toPlaylist, type Playlist } from '@/lib/echo/playlists'
import type { SavedItem } from '@/lib/echo/client'
import { quickSendError, undoSaved } from '@/lib/echo/quick-send'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { cn } from '@/lib/utils'
import { Alert, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Skeleton, Textarea } from './ui'
import { ASK_BOX_STYLE } from './ask-echo'
import type { HomeView } from './home'
import { useMusicPlayer } from './music-player'
import { tellEcho } from './page-tell'
import { SavedCard } from './saved-card'
import { useDictation } from './use-dictation'

const MAX_LINKS = 50

/** Titles for pasted links (in parallel, in order); every link becomes a track even if its title lookup fails. */
async function tracksFromText(text: string): Promise<MusicTrack[]> {
  const ids = parseYoutubeLinks(text).slice(0, MAX_LINKS)
  return Promise.all(ids.map((id) => fetchVideoInfo(id)))
}

const NO_LINKS = 'No YouTube or YouTube Music links found. Paste links like https://youtu.be/… or music.youtube.com/watch?v=…'
const TAKEN = (name: string) => `You already have a playlist called "${name}". Pick another name so Echo knows which one to play.`

const PINK = '#f472b6'
const COVERS = [
  ['#fb923c', '#ef4444'],
  ['#60a5fa', '#34d399'],
  ['#f472b6', '#7c3aed'],
  ['#fbbf24', '#f97316'],
  ['#a78bfa', '#60a5fa'],
  ['#2dd4bf', '#3b82f6'],
] as const
/** A steady cover gradient per name or video. */
function cover(seed: string): CSSProperties {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const [a, b] = COVERS[h % COVERS.length]
  return { background: `linear-gradient(135deg, ${a}, ${b})` }
}
const ORB_DOT_STYLE: CSSProperties = { background: 'radial-gradient(circle at 32% 28%, #a7f3d0, #2dd4bf 45%, #0f766e)' }

export function MusicView({ uid, user, profile, onNavigate }: { uid: string; user?: User; profile?: UserProfile; onNavigate?: (view: HomeView) => void }) {
  const player = useMusicPlayer()
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [listens, setListens] = useState<Listen[] | null>(null)
  const [listenError, setListenError] = useState('')
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [queueOpen, setQueueOpen] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)
  const queueRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return onSnapshot(
      playlistsCol(uid),
      (snap) => {
        const list = snap.docs.map((d) => toPlaylist(d.id, d.data())).filter((p): p is Playlist => p !== null)
        setPlaylists(list.sort((a, b) => a.name.localeCompare(b.name)))
        setLoadError('')
      },
      (e) => {
        setPlaylists([])
        setLoadError(isPermissionDenied(e) ? 'Playlists need the updated Firestore rules. Deploy firestore.rules, then reload.' : 'Could not load your playlists.')
      },
    )
  }, [uid])

  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - LISTEN_WINDOW_DAYS * 86_400_000)
    return onSnapshot(
      query(listensCol(uid), where('startedAt', '>=', since), orderBy('startedAt', 'desc'), limit(500)),
      (snap) => {
        setListens(snap.docs.map((d) => toListen(d.data())).filter((l): l is Listen => l !== null))
        setListenError('')
      },
      (e) => {
        setListens([])
        setListenError(isPermissionDenied(e) ? 'Your listening history needs the updated Firestore rules. Deploy firestore.rules, then reload.' : 'Could not load your listening history.')
      },
    )
  }, [uid])

  // The page's time of day is read once when it opens.
  const [now] = useState(() => new Date())
  const analysis: ListeningAnalysis | null = useMemo(() => (listens ? analyzeListening(listens, now) : null), [listens, now])
  const usual = useMemo(() => (analysis ? usualNow(analysis, now) : null), [analysis, now])
  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: Listen[] = []
    for (const l of listens ?? []) {
      if (seen.has(l.videoId)) continue
      seen.add(l.videoId)
      out.push(l)
      if (out.length >= 5) break
    }
    return out
  }, [listens])

  const playUsual = (u: UsualNow) => player.play({ videoId: u.videoId, title: u.title, ...(u.artist ? { channel: u.artist } : {}) }, { autoplay: true })
  const opened = openId ? playlists?.find((p) => p.id === openId) ?? null : null

  useEffect(() => {
    if (openId) detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [openId])
  useEffect(() => {
    if (queueOpen) queueRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [queueOpen])

  return (
    <div className="animate-in mx-auto max-w-3xl">
      <PageHeader
        title="Music"
        line={musicLine(now, usual)}
        actions={<IconButton icon={Plus} label="New playlist" aria-expanded={creating} onClick={() => setCreating((c) => !c)} />}
      />
      <div className="grid gap-5">
        <MusicAsk uid={uid} user={user} profile={profile} onNavigate={onNavigate} playlists={playlists ?? []} listens={listens ?? []} usual={usual} />

        {usual && (
          <div
            className="flex items-center gap-3 rounded-xl border p-3"
            style={{ borderColor: `color-mix(in srgb, ${PINK} 30%, var(--color-border))`, background: `linear-gradient(160deg, color-mix(in srgb, ${PINK} 16%, transparent), transparent 60%), var(--color-surface)`, boxShadow: `0 0 24px -14px ${PINK}` }}
          >
            <span aria-hidden="true" className="size-13 shrink-0 rounded-xl" style={{ background: `linear-gradient(135deg, ${PINK}, #7c3aed)` }} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold tracking-wider" style={{ color: PINK }}>
                YOUR USUAL NOW
              </p>
              <p className="truncate text-sm font-semibold text-foreground">{usual.title}</p>
              <p className="truncate text-xs text-muted-foreground">{usual.detail}</p>
            </div>
            <button
              type="button"
              aria-label={`Play ${usual.title}`}
              onClick={() => playUsual(usual)}
              className={`grid size-12 shrink-0 place-items-center rounded-full text-white ${FOCUS_RING}`}
              style={{ background: PINK, boxShadow: `0 0 16px ${PINK}66` }}
            >
              <Play size={20} aria-hidden="true" />
            </button>
          </div>
        )}

        {player.track && <NowPlaying onQueue={() => setQueueOpen((o) => !o)} queueOpen={queueOpen} />}

        <section aria-labelledby="playlists-heading">
          <h2 id="playlists-heading" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Playlists
          </h2>
          {loadError && (
            <div className="mb-3">
              <Alert variant="danger">{loadError}</Alert>
            </div>
          )}
          {creating && (
            <div className="mb-3">
              <NewPlaylist uid={uid} playlists={playlists ?? []} onDone={() => setCreating(false)} />
            </div>
          )}
          {playlists === null ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : playlists.length === 0 ? (
            !creating && (
              <EmptyState
                icon={ListMusic}
                title="No playlists yet"
                description='Make one, paste YouTube links into it, then say "play my gym playlist".'
                action={
                  <Button variant="secondary" icon={Plus} onClick={() => setCreating(true)}>
                    New playlist
                  </Button>
                }
              />
            )
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {playlists.map((p) => {
                const n = p.tracks.length
                const on = p.id === openId
                return (
                  <li key={p.id} className={cn('relative rounded-xl border bg-surface p-2', on ? 'border-primary' : 'border-border')}>
                    <button type="button" aria-expanded={on} onClick={() => setOpenId(on ? null : p.id)} className={`block w-full rounded-lg text-left ${FOCUS_RING}`}>
                      <span aria-hidden="true" className="block h-16 w-full rounded-lg" style={cover(p.name)} />
                      <span className="mt-2 block truncate text-sm font-semibold text-foreground">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {n} {n === 1 ? 'song' : 'songs'}
                      </span>
                    </button>
                    {n > 0 && (
                      <button
                        type="button"
                        aria-label={`Play ${p.name}`}
                        onClick={() => player.playTracks(p.tracks, { autoplay: true })}
                        className={`absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60 ${FOCUS_RING}`}
                      >
                        <Play size={18} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {opened && playlists && (
            <div ref={detailRef} className="mt-3">
              <PlaylistCard uid={uid} playlist={opened} playlists={playlists} onClose={() => setOpenId(null)} onPlay={(tracks, start = 0) => player.playTracks(tracks, { start, autoplay: true })} />
            </div>
          )}
        </section>

        {recent.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recently played
            </h2>
            <ul className="grid gap-1">
              {recent.map((l) => (
                <li key={l.videoId}>
                  <button
                    type="button"
                    onClick={() => player.play({ videoId: l.videoId, title: l.title, ...(l.channel ? { channel: l.channel } : {}) }, { autoplay: true })}
                    aria-label={`Play ${l.title}`}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-surface-2 ${FOCUS_RING}`}
                  >
                    <span aria-hidden="true" className="size-9 shrink-0 rounded-lg" style={cover(l.videoId)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{l.title}</span>
                      {l.channel && <span className="block truncate text-xs text-muted-foreground">{l.channel}</span>}
                    </span>
                    <Play size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!player.track && (
          <button
            type="button"
            aria-expanded={queueOpen}
            onClick={() => setQueueOpen((o) => !o)}
            className={`flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface px-4 text-left text-sm text-foreground hover:bg-surface-2 ${FOCUS_RING}`}
          >
            <BarChart3 size={18} aria-hidden="true" className="shrink-0 text-primary" />
            <span className="flex-1">Queue, links and your listening</span>
          </button>
        )}

        {queueOpen && (
          <div ref={queueRef} className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <PasteLinks />
              <UpNext uid={uid} playlists={playlists ?? []} />
            </div>
            <YourListening uid={uid} analysis={analysis} loadError={listenError} />
          </div>
        )}
      </div>
    </div>
  )
}

/** The slim card for what's playing: previous / next and the queue toggle. The docked player stays the real player. */
function NowPlaying({ onQueue, queueOpen }: { onQueue: () => void; queueOpen: boolean }) {
  const { track, queue, next, prev } = useMusicPlayer()
  if (!track) return null
  const pos = queue.index + 1
  const total = queue.tracks.length
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border-strong bg-surface-2 py-2 pl-3 pr-1.5">
      <span aria-hidden="true" className="size-8 shrink-0 rounded-lg" style={cover(track.videoId)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">{total > 1 ? `Song ${pos} of ${total}` : track.channel || 'Playing in the player'}</p>
      </div>
      {total > 1 && <IconButton icon={SkipBack} label="Previous song" onClick={prev} disabled={pos <= 1} />}
      {total > 1 && <IconButton icon={SkipForward} label="Next song" onClick={next} disabled={pos >= total} />}
      <Button variant="ghost" size="sm" aria-expanded={queueOpen} onClick={onQueue}>
        Queue
      </Button>
    </div>
  )
}

type AskResult = { reply: string; saved: SavedItem[]; failed: string[] }
const VIEW_FOR: Partial<Record<SavedItem['type'], HomeView>> = { note: 'Notes', goal: 'Goals', health: 'Health', reminder: 'Reminders', connector: 'Connectors', memory: '2nd Brain' }

/**
 * "Play something, or paste a link": links play at once, "my usual" plays the usual, a song or playlist name is found
 * like the diary's play_music (saved playlist, then history, then a YouTube search), and anything else goes to Echo
 * through the same path as the tell-Echo boxes (saved cards with Undo). The text stays on a failure.
 */
function MusicAsk({ uid, user, profile, onNavigate, playlists, listens, usual }: { uid: string; user?: User; profile?: UserProfile; onNavigate?: (view: HomeView) => void; playlists: Playlist[]; listens: Listen[]; usual: UsualNow | null }) {
  const player = useMusicPlayer()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [result, setResult] = useState<AskResult | null>(null)
  const [undone, setUndone] = useState<Set<number>>(() => new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const who = useMemo(() => ({ getIdToken: () => (user ?? auth.currentUser)?.getIdToken() ?? Promise.reject(new Error('Please sign in again.')) }), [user])

  const fill = (heard: string) => {
    setText((t) => (t.trim() ? `${t.trimEnd()} ${heard}` : heard))
    inputRef.current?.focus()
  }
  const dictation = useDictation(who, { onAutoStop: fill })
  const recording = dictation.state === 'recording'
  const transcribing = dictation.state === 'transcribing'

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const msg = text.trim()
    if (!msg || busy) return
    if (recording) dictation.cancel()
    setBusy(true)
    setError('')
    setNote('')
    setResult(null)
    try {
      const intent = musicBoxIntent(msg)
      if (intent.kind !== 'echo' && !player.available) {
        setError("Music can't play here. Open Echo's Music page in the app.")
        return
      }
      if (intent.kind === 'links') {
        const tracks = await tracksFromText(msg)
        player.playTracks(tracks, { autoplay: true })
        setText('')
        setNote(`Playing ${tracks.length === 1 ? tracks[0].title : `${tracks.length} songs`}.`)
      } else if (intent.kind === 'usual') {
        if (!usual) {
          setError('Play a few songs first and Echo learns your usual. Try a song name or paste a link.')
          return
        }
        player.play({ videoId: usual.videoId, title: usual.title, ...(usual.artist ? { channel: usual.artist } : {}) }, { autoplay: true })
        setText('')
        setNote(`Playing your usual: ${usual.title}.`)
      } else if (intent.kind === 'play') {
        const r = await findMusic(intent.query, { playlists: async () => playlists, history: () => listens, find: (q) => findTrack(who, q, { text: msg }) })
        if (!r.outcome.ok) {
          setError(r.outcome.reply)
          return
        }
        if (r.queue.length > 1) player.playTracks(r.queue, { autoplay: true })
        else player.play(r.outcome.track, { autoplay: true })
        setText('')
        setNote(`Playing ${r.outcome.track.title}.`)
      } else {
        const out = await tellEcho({ uid, text: msg, user, profile })
        setText('')
        setUndone(new Set())
        setResult({ reply: out.reply, saved: out.saved, failed: out.failed.filter((f) => f !== 'reply') })
      }
    } catch (err) {
      // Nothing was saved: keep the words so the user can send again.
      setError(isPermissionDenied(err) ? RULES_MESSAGE : err instanceof Error && /^Please sign in/.test(err.message) ? err.message : quickSendError(err))
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
      if (await undoSaved(uid, item)) setUndone((s) => new Set(s).add(i))
    } catch (err) {
      setError(isPermissionDenied(err) ? RULES_MESSAGE : `Couldn't undo "${item.label}". Try again.`)
    }
  }

  const placeholder = 'Play something, or paste a link'
  const micLabel = recording ? 'Stop and use what I said' : transcribing ? 'Turning speech into text' : 'Speak instead of typing'
  const shownError = error || (dictation.state === 'error' ? dictation.error : '')
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
            aria-label="Play or send to Echo"
            disabled={busy}
            className="grid size-11 flex-none place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_16px_#2dd4bf66] hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
          </button>
        )}
      </form>

      {shownError && (
        <p role="alert" className="px-1 text-sm text-danger">
          {shownError}
        </p>
      )}
      {note && (
        <p role="status" className="px-1 text-sm text-muted-foreground">
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

function PasteLinks() {
  const player = useMusicPlayer()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'play' | 'queue' | null>(null)
  const [message, setMessage] = useState('')

  async function go(mode: 'play' | 'queue') {
    setMessage('')
    if (!parseYoutubeLinks(text).length) {
      setMessage(NO_LINKS)
      return
    }
    setBusy(mode)
    try {
      const tracks = await tracksFromText(text)
      if (mode === 'play') player.playTracks(tracks, { autoplay: true })
      else player.enqueue(tracks)
      setText('')
      setMessage(mode === 'play' ? `Playing ${tracks.length === 1 ? tracks[0].title : `${tracks.length} songs`}.` : `Added ${tracks.length} to Up next.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-foreground">Play links</h2>
      <p className="mt-1 text-sm text-muted-foreground">Paste one or more YouTube or YouTube Music links.</p>
      <div className="mt-3">
        <Textarea aria-label="YouTube links" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={20000} placeholder="https://youtu.be/…" />
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button icon={Play} loading={busy === 'play'} disabled={busy !== null || !text.trim()} onClick={() => void go('play')} className="w-full sm:flex-1">
          Play now
        </Button>
        <Button variant="secondary" icon={Plus} loading={busy === 'queue'} disabled={busy !== null || !text.trim()} onClick={() => void go('queue')} className="w-full sm:flex-1">
          Add to Up next
        </Button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </Card>
  )
}

function UpNext({ uid, playlists }: { uid: string; playlists: Playlist[] }) {
  const { queue, jump, remove } = useMusicPlayer()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function save() {
    const clean = cleanPlaylistName(name)
    if (!clean) return
    if (playlistNameTaken(clean, playlists)) {
      setMessage(TAKEN(clean))
      return
    }
    if (playlists.length >= PLAYLIST_LIMITS.playlists) {
      setMessage(`You can have up to ${PLAYLIST_LIMITS.playlists} playlists.`)
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const tracks = addTracks([], queue.tracks)
      await createPlaylist(uid, clean, tracks)
      setSaving(false)
      setName('')
      setMessage(tracks.length < queue.tracks.length ? `Saved as "${clean}" with ${tracks.length} songs (duplicates and songs past ${PLAYLIST_LIMITS.tracks} were left out).` : `Saved as "${clean}".`)
    } catch {
      setMessage('Could not save the playlist. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Up next</h2>
        {queue.tracks.length > 0 && !saving && (
          <Button variant="ghost" size="sm" onClick={() => setSaving(true)}>
            Save as playlist
          </Button>
        )}
      </div>
      {saving && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="min-w-0 flex-1">
            <Input label="Playlist name" value={name} onChange={(e) => setName(e.target.value)} maxLength={PLAYLIST_LIMITS.name} placeholder="Gym" autoFocus />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={!cleanPlaylistName(name)}>
              Save
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setSaving(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {queue.tracks.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing queued. Play links or a playlist, or ask Echo to play something.</p>
      ) : (
        <ol className="mt-3 max-h-72 space-y-1 overflow-y-auto" aria-label="Queue">
          {queue.tracks.map((t, i) => (
            <TrackRow key={`${t.videoId}-${i}`} track={t} index={i} current={i === queue.index} onPlay={() => jump(i)} onRemove={() => remove(i)} />
          ))}
        </ol>
      )}
      {message && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </Card>
  )
}

function TrackRow({ track, index, current = false, removeDisabled = false, onPlay, onRemove }: { track: MusicTrack; index: number; current?: boolean; removeDisabled?: boolean; onPlay: () => void; onRemove: () => void }) {
  return (
    <li className={`flex items-center gap-1 rounded-lg pl-1 ${current ? 'bg-primary-soft' : ''}`} aria-current={current ? 'true' : undefined}>
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-surface-2 max-lg:min-h-11" aria-label={`Play ${track.title}`}>
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${current ? 'font-medium text-primary' : 'text-foreground'}`}>{track.title}</span>
          {track.channel && <span className="block truncate text-xs text-muted-foreground">{track.channel}</span>}
        </span>
      </button>
      <IconButton icon={X} label={`Remove ${track.title}`} size="sm" onClick={onRemove} disabled={removeDisabled} />
    </li>
  )
}

function NewPlaylist({ uid, playlists, onDone }: { uid: string; playlists: Playlist[]; onDone?: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function create() {
    const clean = cleanPlaylistName(name)
    if (!clean) return
    if (playlistNameTaken(clean, playlists)) {
      setMessage(TAKEN(clean))
      return
    }
    if (playlists.length >= PLAYLIST_LIMITS.playlists) {
      setMessage(`You can have up to ${PLAYLIST_LIMITS.playlists} playlists.`)
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await createPlaylist(uid, clean)
      setName('')
      onDone?.()
    } catch {
      setMessage('Could not create the playlist. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        void create()
      }}
    >
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <Input label="New playlist" value={name} onChange={(e) => setName(e.target.value)} maxLength={PLAYLIST_LIMITS.name} placeholder="Gym, Chill Sunday…" autoFocus />
      </div>
      <Button type="submit" icon={Plus} loading={busy} disabled={!cleanPlaylistName(name)} className="w-full sm:w-auto">
        Create
      </Button>
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </form>
  )
}

function PlaylistCard({ uid, playlist, playlists, onPlay, onClose }: { uid: string; playlist: Playlist; playlists: Playlist[]; onPlay: (tracks: MusicTrack[], start?: number) => void; onClose?: () => void }) {
  const [open, setOpen] = useState(true)
  const [links, setLinks] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(playlist.name)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const count = playlist.tracks.length
  const full = count >= PLAYLIST_LIMITS.tracks
  const summary = useMemo(() => `${count} ${count === 1 ? 'song' : 'songs'}`, [count])

  async function run(action: () => Promise<void>, failText: string) {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch {
      setMessage(failText)
    } finally {
      setBusy(false)
    }
  }

  async function addLinks() {
    if (!parseYoutubeLinks(links).length) {
      setMessage(NO_LINKS)
      return
    }
    await run(async () => {
      const more = await tracksFromText(links)
      let before = 0
      const next = await updatePlaylistTracks(uid, playlist.id, (latest) => {
        before = latest.length
        return addTracks(latest, more)
      })
      setLinks('')
      const added = next.length - before
      setMessage(added ? `Added ${added} ${added === 1 ? 'song' : 'songs'}.` : next.length >= PLAYLIST_LIMITS.tracks ? `This playlist is full (${PLAYLIST_LIMITS.tracks} songs).` : 'Those songs are already in this playlist.')
    }, 'Could not add the songs. Please try again.')
  }

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{playlist.name}</h3>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconButton
            icon={Pencil}
            label={`Rename ${playlist.name}`}
            size="sm"
            onClick={() => {
              setName(playlist.name)
              setRenaming((r) => !r)
            }}
          />
          <IconButton icon={Trash2} label={`Delete ${playlist.name}`} size="sm" onClick={() => setConfirming(true)} />
          {onClose && <IconButton icon={X} label={`Close ${playlist.name}`} size="sm" onClick={onClose} />}
        </div>
      </div>
      {renaming && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const clean = cleanPlaylistName(name)
            if (clean && playlistNameTaken(clean, playlists, playlist.id)) setMessage(TAKEN(clean))
            else if (clean) void run(() => renamePlaylist(uid, playlist.id, clean).then(() => setRenaming(false)), 'Could not rename. Please try again.')
          }}
        >
          <div className="min-w-0 flex-1">
            <Input aria-label="Playlist name" value={name} onChange={(e) => setName(e.target.value)} maxLength={PLAYLIST_LIMITS.name} />
          </div>
          <Button type="submit" size="sm" loading={busy} disabled={!cleanPlaylistName(name)}>
            Save
          </Button>
        </form>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon={Play} size="sm" disabled={!count} onClick={() => onPlay(playlist.tracks)}>
          Play
        </Button>
        <Button variant="secondary" icon={Shuffle} size="sm" disabled={count < 2} onClick={() => onPlay(shuffled(playlist.tracks))}>
          Shuffle
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide songs' : 'Songs and links'}
        </Button>
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          {!full && (
            <div className="space-y-2">
              <Textarea aria-label={`Add YouTube links to ${playlist.name}`} value={links} onChange={(e) => setLinks(e.target.value)} rows={2} maxLength={20000} placeholder="Paste YouTube links to add" />
              <Button variant="secondary" icon={Plus} size="sm" loading={busy} disabled={!links.trim()} onClick={() => void addLinks()}>
                Add links
              </Button>
            </div>
          )}
          {count === 0 ? (
            <p className="text-sm text-muted-foreground">No songs yet. Paste YouTube links above.</p>
          ) : (
            <ol className="max-h-72 space-y-1 overflow-y-auto" aria-label={`Songs in ${playlist.name}`}>
              {playlist.tracks.map((t, i) => (
                <TrackRow
                  key={`${t.videoId}-${i}`}
                  track={t}
                  index={i}
                  onPlay={() => onPlay(playlist.tracks, i)}
                  removeDisabled={busy}
                  onRemove={() => void run(() => updatePlaylistTracks(uid, playlist.id, (latest) => latest.filter((x) => x.videoId !== t.videoId)).then(() => undefined), 'Could not remove the song. Please try again.')}
                />
              ))}
            </ol>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Delete "${playlist.name}"?`}
          body="The playlist and its song list are removed. The songs stay on YouTube."
          confirmLabel="Delete playlist"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void run(() => deletePlaylist(uid, playlist.id), 'Could not delete. Please try again.').then(() => setConfirming(false))}
        />
      )}
    </Card>
  )
}

/** "Your listening": what Echo has learned from its own player (last 60 days), and a way to clear it. */
function YourListening({ uid, analysis: a, loadError }: { uid: string; analysis: ListeningAnalysis | null; loadError: string }) {
  const player = useMusicPlayer()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function clear() {
    setBusy(true)
    setError(null)
    try {
      await clearListens(uid)
      setConfirming(false)
    } catch {
      setError('Could not clear your listening history. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <BarChart3 size={18} aria-hidden="true" className="text-primary" />
          Your listening
        </h2>
        {a && a.plays > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Clear history
          </Button>
        )}
      </div>
      {loadError ? (
        <div className="mt-3">
          <Alert variant="warning">{loadError}</Alert>
        </div>
      ) : !a ? (
        <Skeleton className="mt-3 h-16" />
      ) : a.plays === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Play some music and Echo learns what you like. Then ask &quot;play my usual&quot; or &quot;what do I listen to most?&quot;.</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Most played</h3>
            <ol className="mt-2 space-y-1">
              {a.topSongs.slice(0, 5).map((s) => (
                <li key={s.videoId} className="flex items-center gap-2">
                  <IconButton icon={Play} label={`Play ${s.title}`} size="sm" onClick={() => player.play({ videoId: s.videoId, title: s.title, ...(s.artist ? { channel: s.artist } : {}) }, { autoplay: true })} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{s.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{s.plays}×</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {a.plays} plays in the last {LISTEN_WINDOW_DAYS} days.
            </p>
            {a.topArtists.length > 0 && (
              <p>
                <span className="font-medium text-foreground">Top artists: </span>
                <span className="text-muted-foreground">{a.topArtists.slice(0, 5).map((x) => x.name).join(', ')}</span>
              </p>
            )}
            {a.habits.slice(0, 3).map((h) => (
              <p key={h.when}>
                <span className="font-medium capitalize text-foreground">{h.when}: </span>
                <span className="text-muted-foreground">{h.title}</span>
              </p>
            ))}
            {a.newThisWeek.length > 0 && (
              <p>
                <span className="font-medium text-foreground">New this week: </span>
                <span className="text-muted-foreground">{a.newThisWeek.map((s) => s.title).join('; ')}</span>
              </p>
            )}
            {a.oftenSkipped.length > 0 && (
              <p>
                <span className="font-medium text-foreground">Usually skipped: </span>
                <span className="text-muted-foreground">{a.oftenSkipped.map((s) => s.title).join('; ')}</span>
              </p>
            )}
          </div>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Clear your listening history?"
          body="Echo forgets what you have played and your listening habits. Your playlists stay."
          confirmLabel="Clear history"
          busy={busy}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void clear()}
        />
      )}
    </Card>
  )
}
