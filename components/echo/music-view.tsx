'use client'

/**
 * Music page: paste YouTube / YouTube Music links to play them or add them to "Up next", see the queue, and build
 * playlists from links (saved per user). Titles come from YouTube's oEmbed (no key). Playback is the shell's docked
 * player (useMusicPlayer); asking Echo "play my <name> playlist" plays a saved list too.
 */
import { useEffect, useMemo, useState } from 'react'
import { limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { BarChart3, ListMusic, Pencil, Play, Plus, Shuffle, Trash2, X } from 'lucide-react'
import { clearListens, createPlaylist, deletePlaylist, listensCol, playlistsCol, renamePlaylist, updatePlaylistTracks } from '@/lib/firestore'
import { analyzeListening, LISTEN_WINDOW_DAYS, toListen, type Listen, type ListeningAnalysis } from '@/lib/echo/listening'
import { isPermissionDenied } from '@/lib/echo/diary'
import { fetchVideoInfo } from '@/lib/echo/music'
import type { MusicTrack } from '@/lib/echo/music-play'
import { addTracks, cleanPlaylistName, parseYoutubeLinks, PLAYLIST_LIMITS, shuffled, toPlaylist, type Playlist } from '@/lib/echo/playlists'
import { Alert, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Skeleton, Textarea } from './ui'
import { useMusicPlayer } from './music-player'

const MAX_LINKS = 50

/** Titles for pasted links (in parallel, in order); every link becomes a track even if its title lookup fails. */
async function tracksFromText(text: string): Promise<MusicTrack[]> {
  const ids = parseYoutubeLinks(text).slice(0, MAX_LINKS)
  return Promise.all(ids.map((id) => fetchVideoInfo(id)))
}

const NO_LINKS = 'No YouTube or YouTube Music links found. Paste links like https://youtu.be/… or music.youtube.com/watch?v=…'

export function MusicView({ uid }: { uid: string }) {
  const player = useMusicPlayer()
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [loadError, setLoadError] = useState('')

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

  return (
    <div className="animate-in">
      <PageHeader title="Music" description='Play YouTube links and build playlists. You can also ask Echo: "play my gym playlist".' />
      <div className="grid gap-4 lg:grid-cols-2">
        <PasteLinks />
        <UpNext uid={uid} playlistCount={playlists?.length ?? 0} />
      </div>
      <YourListening uid={uid} />
      <section aria-labelledby="playlists-heading" className="mt-6">
        <h2 id="playlists-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Playlists
        </h2>
        {loadError && (
          <div className="mb-4">
            <Alert variant="danger">{loadError}</Alert>
          </div>
        )}
        <NewPlaylist uid={uid} count={playlists?.length ?? 0} />
        {playlists === null ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : playlists.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={ListMusic} title="No playlists yet" description="Create one above, then paste YouTube links into it." />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {playlists.map((p) => (
              <PlaylistCard key={p.id} uid={uid} playlist={p} onPlay={(tracks, start = 0) => player.playTracks(tracks, { start, autoplay: true })} />
            ))}
          </div>
        )}
      </section>
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

function UpNext({ uid, playlistCount }: { uid: string; playlistCount: number }) {
  const { queue, jump, remove } = useMusicPlayer()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function save() {
    const clean = cleanPlaylistName(name)
    if (!clean) return
    if (playlistCount >= PLAYLIST_LIMITS.playlists) {
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

function NewPlaylist({ uid, count }: { uid: string; count: number }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function create() {
    const clean = cleanPlaylistName(name)
    if (!clean) return
    if (count >= PLAYLIST_LIMITS.playlists) {
      setMessage(`You can have up to ${PLAYLIST_LIMITS.playlists} playlists.`)
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await createPlaylist(uid, clean)
      setName('')
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
        <Input label="New playlist" value={name} onChange={(e) => setName(e.target.value)} maxLength={PLAYLIST_LIMITS.name} placeholder="Gym, Chill Sunday…" />
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

function PlaylistCard({ uid, playlist, onPlay }: { uid: string; playlist: Playlist; onPlay: (tracks: MusicTrack[], start?: number) => void }) {
  const [open, setOpen] = useState(false)
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
        </div>
      </div>
      {renaming && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const clean = cleanPlaylistName(name)
            if (clean) void run(() => renamePlaylist(uid, playlist.id, clean).then(() => setRenaming(false)), 'Could not rename. Please try again.')
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
function YourListening({ uid }: { uid: string }) {
  const player = useMusicPlayer()
  const [listens, setListens] = useState<Listen[] | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - LISTEN_WINDOW_DAYS * 86_400_000)
    return onSnapshot(
      query(listensCol(uid), where('startedAt', '>=', since), orderBy('startedAt', 'desc'), limit(500)),
      (snap) => setListens(snap.docs.map((d) => toListen(d.data())).filter((l): l is Listen => l !== null)),
      () => setListens([]),
    )
  }, [uid])
  const a: ListeningAnalysis | null = useMemo(() => (listens ? analyzeListening(listens, new Date()) : null), [listens])

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
      {!a ? (
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
