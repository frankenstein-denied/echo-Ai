import { describe, expect, it } from 'vitest'
import {
  addTracks,
  cleanPlaylistName,
  isEndedMessage,
  matchPlaylist,
  parseYoutubeLinks,
  PLAYLIST_LIMITS,
  queueReducer,
  shuffled,
  toPlaylist,
  type QueueState,
} from './playlists'

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'
const C = 'ccccccccccc'
const t = (videoId: string, title = videoId) => ({ videoId, title })

describe('parseYoutubeLinks', () => {
  it('finds every YouTube link in pasted text, in order, without duplicates', () => {
    const text = `https://youtu.be/${A}\nhttps://music.youtube.com/watch?v=${B}&si=x  youtube.com/shorts/${C} https://youtu.be/${A} https://example.com/x`
    expect(parseYoutubeLinks(text)).toEqual([A, B, C])
  })
  it('returns nothing for text without links', () => {
    expect(parseYoutubeLinks('lofi beats')).toEqual([])
  })
})

describe('cleanPlaylistName', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(cleanPlaylistName('  Gym   mix ')).toBe('Gym mix')
    expect(cleanPlaylistName('x'.repeat(100))).toHaveLength(PLAYLIST_LIMITS.name)
    expect(cleanPlaylistName('   ')).toBe('')
  })
})

describe('addTracks', () => {
  it('appends new tracks, skips ones already there and stops at the limit', () => {
    expect(addTracks([t(A)], [t(B), t(A), t(C)]).map((x) => x.videoId)).toEqual([A, B, C])
    const full = Array.from({ length: PLAYLIST_LIMITS.tracks }, (_, i) => t(String(i).padStart(11, 'x')))
    expect(addTracks(full, [t(A)])).toHaveLength(PLAYLIST_LIMITS.tracks)
  })
})

describe('toPlaylist', () => {
  it('reads a stored playlist and drops bad tracks', () => {
    const p = toPlaylist('p1', { name: 'Gym', tracks: [t(A, 'Song A'), { videoId: 'bad', title: 'x' }, { videoId: B }, 'junk'] })
    expect(p).toEqual({ id: 'p1', name: 'Gym', tracks: [{ videoId: A, title: 'Song A' }, { videoId: B, title: 'YouTube video' }] })
  })
  it('rejects a doc without a name', () => {
    expect(toPlaylist('p1', { tracks: [] })).toBeNull()
  })
})

describe('matchPlaylist', () => {
  const lists = [
    { id: '1', name: 'Gym', tracks: [t(A)] },
    { id: '2', name: 'Chill Sunday', tracks: [t(B)] },
    { id: '3', name: 'Empty', tracks: [] },
  ]
  it('matches a name with or without "my" and "playlist", ignoring case', () => {
    expect(matchPlaylist('gym', lists)?.id).toBe('1')
    expect(matchPlaylist('my gym playlist', lists)?.id).toBe('1')
    expect(matchPlaylist('the Chill Sunday playlist', lists)?.id).toBe('2')
  })
  it('never matches a song query or an empty playlist', () => {
    expect(matchPlaylist('lofi beats', lists)).toBeNull()
    expect(matchPlaylist('empty playlist', lists)).toBeNull()
    expect(matchPlaylist('gym workout songs', lists)).toBeNull()
  })
})

describe('shuffled', () => {
  it('keeps every track and uses the random source', () => {
    const out = shuffled([t(A), t(B), t(C)], () => 0)
    expect(out.map((x) => x.videoId).sort()).toEqual([A, B, C])
    expect(out.map((x) => x.videoId)).not.toEqual([A, B, C])
  })
})

describe('queueReducer', () => {
  const empty: QueueState = { tracks: [], index: 0, autoplay: false, key: 0, cause: 'user' }
  it('play replaces the queue and starts at the given track', () => {
    const s = queueReducer(empty, { type: 'play', tracks: [t(A), t(B)], start: 1, autoplay: true })
    expect(s).toEqual({ tracks: [t(A), t(B)], index: 1, autoplay: true, key: 1, cause: 'user' })
  })
  it('enqueue appends, and starts playing when nothing is queued', () => {
    const s1 = queueReducer(empty, { type: 'enqueue', tracks: [t(A)] })
    expect(s1.tracks).toEqual([t(A)])
    expect(s1.autoplay).toBe(true)
    const s2 = queueReducer(s1, { type: 'enqueue', tracks: [t(B)] })
    expect(s2.tracks).toEqual([t(A), t(B)])
    expect(s2.key).toBe(s1.key)
  })
  it('next and prev move within the queue and autoplay; next past the end stops', () => {
    const s = queueReducer(empty, { type: 'play', tracks: [t(A), t(B)], start: 0, autoplay: false })
    const n = queueReducer(s, { type: 'next' })
    expect([n.index, n.autoplay, n.key]).toEqual([1, true, s.key + 1])
    expect(queueReducer(n, { type: 'prev' }).index).toBe(0)
    expect(queueReducer(n, { type: 'next' })).toBe(n)
    expect(queueReducer(s, { type: 'prev' })).toBe(s)
  })
  it('remove drops a queued track and keeps the current one playing', () => {
    const s = queueReducer(empty, { type: 'play', tracks: [t(A), t(B), t(C)], start: 1, autoplay: true })
    const r = queueReducer(s, { type: 'remove', index: 2 })
    expect(r.tracks).toEqual([t(A), t(B)])
    expect([r.index, r.key]).toEqual([1, s.key])
    const before = queueReducer(s, { type: 'remove', index: 0 })
    expect([before.index, before.key]).toEqual([0, s.key])
  })
  it('ended advances once per song, even when YouTube reports the end twice', () => {
    const s = queueReducer(empty, { type: 'play', tracks: [t(A), t(B), t(C)], start: 0, autoplay: true })
    const once = queueReducer(s, { type: 'ended', key: s.key })
    expect([once.index, once.cause]).toEqual([1, 'ended'])
    expect(queueReducer(once, { type: 'ended', key: s.key })).toBe(once)
    expect(queueReducer(queueReducer(once, { type: 'next' }), { type: 'ended', key: s.key }).index).toBe(2)
  })
  it('pause reopens the current track paused; close empties the queue', () => {
    const s = queueReducer(empty, { type: 'play', tracks: [t(A)], start: 0, autoplay: true })
    expect(queueReducer(s, { type: 'pause' })).toMatchObject({ autoplay: false, key: s.key + 1 })
    expect(queueReducer(s, { type: 'close' }).tracks).toEqual([])
  })
})

describe('isEndedMessage', () => {
  it('reads the YouTube embed "ended" state from both message shapes', () => {
    expect(isEndedMessage(JSON.stringify({ event: 'onStateChange', info: 0 }))).toBe(true)
    expect(isEndedMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }))).toBe(true)
    expect(isEndedMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1 } }))).toBe(false)
    expect(isEndedMessage('not json')).toBe(false)
    expect(isEndedMessage({ event: 'onStateChange', info: 0 })).toBe(false)
  })
})
