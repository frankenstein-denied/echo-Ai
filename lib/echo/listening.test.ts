import { describe, expect, it } from 'vitest'
import { analyzeListening, artistOf, isPausedMessage, isPlayingMessage, listenOutcome, matchHistory, renderListeningHabits, toListen, type Listen } from './listening'

// Tue 2026-11-17 (local time); history goes back from here.
const NOW = new Date(2026, 10, 17, 20, 0)
const at = (daysAgo: number, hour: number) => new Date(2026, 10, 17 - daysAgo, hour, 15).getTime()
const L = (videoId: string, title: string, channel: string, startedMs: number, outcome: Listen['outcome'] = 'finished', listenedSec = 200): Listen => ({ videoId, title, channel, startedMs, outcome, listenedSec })

const LOFI = 'lofi0000000'
const TIGER = 'tiger000000'
const NEW = 'newsong0000'
const SKIP = 'skipme00000'

function history(): Listen[] {
  const out: Listen[] = []
  // Weekday evenings: lofi (Lofi Girl), many times.
  for (const d of [0, 1, 4, 5, 6, 7, 8]) out.push(L(LOFI, 'lofi hip hop radio - beats to relax/study to', 'Lofi Girl', at(d, 20)))
  // Weekday mornings: Eye of the Tiger.
  for (const d of [1, 4, 7]) out.push(L(TIGER, 'Survivor - Eye Of The Tiger (Official HD Video)', 'SurvivorVEVO', at(d, 7)))
  // Often skipped.
  for (const d of [1, 2, 3]) out.push(L(SKIP, 'Annoying Song', 'Some Artist - Topic', at(d, 13), 'skipped', 10))
  // New this week.
  for (const d of [0, 1]) out.push(L(NEW, 'Brand New Track', 'Newcomer', at(d, 15)))
  // Too old to count.
  out.push(L('old00000000', 'Old Song', 'Old Band', at(90, 20)))
  return out
}

describe('artistOf', () => {
  it('cleans YouTube channel names', () => {
    expect(artistOf('SurvivorVEVO')).toBe('Survivor')
    expect(artistOf('Some Artist - Topic')).toBe('Some Artist')
    expect(artistOf('Lofi Girl')).toBe('Lofi Girl')
    expect(artistOf(undefined)).toBe('')
  })
})

describe('analyzeListening', () => {
  const a = analyzeListening(history(), NOW)
  it('counts plays in the last 60 days only', () => {
    expect(a.plays).toBe(15)
  })
  it('ranks songs and artists by plays', () => {
    expect(a.topSongs[0]).toMatchObject({ videoId: LOFI, plays: 7 })
    expect(a.topArtists[0]).toEqual({ name: 'Lofi Girl', plays: 7 })
    expect(a.topArtists.map((x) => x.name)).toContain('Survivor')
  })
  it('finds time-of-day habits', () => {
    expect(a.habits).toContainEqual({ when: 'weekday evenings', title: 'lofi hip hop radio - beats to relax/study to', artist: 'Lofi Girl', videoId: LOFI, plays: 7 })
    expect(a.habits.find((h) => h.when === 'weekday mornings')?.videoId).toBe(TIGER)
  })
  it('lists songs usually skipped and new favourites', () => {
    expect(a.oftenSkipped.map((x) => x.videoId)).toEqual([SKIP])
    expect(a.topSongs.map((x) => x.videoId)).not.toContain(SKIP)
    expect(a.newThisWeek.map((x) => x.videoId)).toEqual([NEW])
  })
  it('is empty for no history', () => {
    expect(analyzeListening([], NOW)).toMatchObject({ plays: 0, topSongs: [], habits: [] })
  })
})

describe('renderListeningHabits', () => {
  it('summarises the analysis in a few lines for Echo', () => {
    const text = renderListeningHabits(analyzeListening(history(), NOW))
    expect(text).toContain('Listening habits (last 60 days, 15 plays)')
    expect(text).toContain('Most played: lofi hip hop radio - beats to relax/study to (Lofi Girl, 7)')
    expect(text).toContain('Weekday evenings: lofi hip hop radio - beats to relax/study to (Lofi Girl)')
    expect(text).toContain('Usually skipped: Annoying Song')
    expect(text).toContain('New this week: Brand New Track')
    expect(text).not.toContain('(Official HD Video)')
    expect(text.length).toBeLessThanOrEqual(900)
  })
  it('opens with the only-when-asked rule', () => {
    expect(renderListeningHabits(analyzeListening(history(), NOW))).toContain('use only when the user asks about or for their music; never bring it up yourself')
  })
  it('says nothing without plays', () => {
    expect(renderListeningHabits(analyzeListening([], NOW))).toBe('')
  })
})

describe('matchHistory', () => {
  it('replays a song the user played before, by title words, most played first', () => {
    expect(matchHistory('eye of the tiger', history())?.videoId).toBe(TIGER)
    expect(matchHistory('lofi hip hop', history())?.videoId).toBe(LOFI)
  })
  it('never hijacks generic or one-word mood requests (those still search)', () => {
    const withBoilerplate = [...history(), L('ofc00000000', 'Big Hit (Official Music Video)', 'Star', at(1, 10))]
    for (const q of ['music', 'some music', 'play something', 'video', 'lofi', 'jazz', 'official music video']) expect(matchHistory(q, withBoilerplate)).toBeNull()
  })
  it('matches title plus artist, and a cut-off last word', () => {
    expect(matchHistory('Eye of the Tiger Survivor', history())?.videoId).toBe(TIGER)
    expect(matchHistory('lofi hip hop radio beats to rel', history())?.videoId).toBe(LOFI)
  })
  it('ignores short or unknown queries', () => {
    expect(matchHistory('a', history())).toBeNull()
    expect(matchHistory('bohemian rhapsody', history())).toBeNull()
  })
})

describe('toListen', () => {
  it('reads a stored listen and rejects bad docs', () => {
    expect(toListen({ videoId: LOFI, title: 'x', channel: 'c', startedAt: { toMillis: () => 5 }, outcome: 'skipped', listenedSec: 3 })).toEqual({ videoId: LOFI, title: 'x', channel: 'c', startedMs: 5, outcome: 'skipped', listenedSec: 3 })
    expect(toListen({ videoId: 'bad', title: 'x', startedAt: { toMillis: () => 5 }, outcome: 'playing' })).toBeNull()
    expect(toListen({ videoId: LOFI, title: 'x', outcome: 'playing' })).toBeNull()
  })
})

describe('isPlayingMessage', () => {
  it('reads the YouTube embed "playing" state', () => {
    expect(isPlayingMessage(JSON.stringify({ event: 'onStateChange', info: 1 }))).toBe(true)
    expect(isPlayingMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1 } }))).toBe(true)
    expect(isPlayingMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 2 } }))).toBe(false)
    expect(isPlayingMessage('x')).toBe(false)
  })
})

describe('listenOutcome', () => {
  it('a call interrupting a song is never a skip', () => {
    expect(listenOutcome(false, 5, true)).toBe('partial')
    expect(listenOutcome(false, 5)).toBe('skipped')
    expect(listenOutcome(true, 5)).toBe('finished')
  })
})

describe('isPausedMessage', () => {
  it('reads the YouTube embed "paused" state', () => {
    expect(isPausedMessage(JSON.stringify({ event: 'onStateChange', info: 2 }))).toBe(true)
    expect(isPausedMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 2 } }))).toBe(true)
    expect(isPausedMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1 } }))).toBe(false)
  })
})
