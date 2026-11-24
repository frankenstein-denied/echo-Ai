import { describe, expect, it } from 'vitest'
import { brainLine, checkInSummary, clock12, musicBoxIntent, musicLine, partOfDayLabel, usualNow } from './page-lines'
import type { ListeningAnalysis } from './listening'

describe('clock12', () => {
  it('reads HH:MM as a short 12-hour time', () => {
    expect(clock12('22:00')).toBe('10 PM')
    expect(clock12('07:00')).toBe('7 AM')
    expect(clock12('00:00')).toBe('12 AM')
    expect(clock12('12:30')).toBe('12:30 PM')
    expect(clock12('nonsense')).toBe('nonsense')
  })
})

describe('checkInSummary', () => {
  it('says the cap and the quiet hours from the stored settings', () => {
    expect(checkInSummary({ enabled: true, sleepStart: '22:00', sleepEnd: '07:00' })).toBe('Up to 5 a day · quiet 10 PM–7 AM')
    expect(checkInSummary({ enabled: true, sleepStart: '23:30', sleepEnd: '06:15' })).toBe('Up to 5 a day · quiet 11:30 PM–6:15 AM')
  })
  it('says Off when check-ins are off', () => {
    expect(checkInSummary({ enabled: false, sleepStart: '22:00', sleepEnd: '07:00' })).toBe('Off')
  })
})

describe('partOfDayLabel', () => {
  it('names the part of the day', () => {
    expect(partOfDayLabel(new Date(2026, 10, 24, 8))).toBe('Morning')
    expect(partOfDayLabel(new Date(2026, 10, 24, 13))).toBe('Afternoon')
    expect(partOfDayLabel(new Date(2026, 10, 24, 19))).toBe('Evening')
    expect(partOfDayLabel(new Date(2026, 10, 24, 2))).toBe('Night')
  })
})

const base: ListeningAnalysis = { plays: 0, topSongs: [], topArtists: [], habits: [], oftenSkipped: [], newThisWeek: [] }
// 2026-11-24 is a Tuesday (a weekday).
const tuesdayEvening = new Date(2026, 10, 24, 19)

describe('usualNow', () => {
  it('is null with no plays', () => {
    expect(usualNow(base, tuesdayEvening)).toBeNull()
  })
  it('prefers the habit for this exact slot, then the same part of day, then the top song', () => {
    const a: ListeningAnalysis = {
      ...base,
      plays: 30,
      topSongs: [{ videoId: 'top', title: 'Top song', artist: 'A', plays: 12 }],
      habits: [
        { when: 'weekend evenings', videoId: 'we', title: 'Weekend mix', artist: '', plays: 6 },
        { when: 'weekday evenings', videoId: 'wd', title: 'Lo-fi evening mix', artist: 'Cafe', plays: 9 },
      ],
    }
    expect(usualNow(a, tuesdayEvening)).toEqual({ videoId: 'wd', title: 'Lo-fi evening mix', artist: 'Cafe', detail: 'played 9 evenings' })
    const noWeekday = { ...a, habits: [a.habits[0]] }
    expect(usualNow(noWeekday, tuesdayEvening)?.videoId).toBe('we')
    expect(usualNow(a, new Date(2026, 10, 24, 8))).toEqual({ videoId: 'top', title: 'Top song', artist: 'A', detail: 'played 12 times lately' })
  })
})

describe('musicLine', () => {
  it('names the part of the day and the usual', () => {
    expect(musicLine(tuesdayEvening, { title: 'Lo-fi evening mix' })).toBe('Evening · you usually play Lo-fi evening mix')
    expect(musicLine(tuesdayEvening, null)).toBe('Evening · play something or paste a link')
  })
})

describe('musicBoxIntent', () => {
  it('plays pasted YouTube links', () => {
    expect(musicBoxIntent('https://youtu.be/dQw4w9WgXcQ and https://www.youtube.com/watch?v=abcdefghijk')).toEqual({ kind: 'links', ids: ['dQw4w9WgXcQ', 'abcdefghijk'] })
  })
  it('plays the usual', () => {
    expect(musicBoxIntent('play my usual')).toEqual({ kind: 'usual' })
    expect(musicBoxIntent('Usual')).toEqual({ kind: 'usual' })
    expect(musicBoxIntent('play something')).toEqual({ kind: 'usual' })
  })
  it('plays a named song or playlist, with or without "play"', () => {
    expect(musicBoxIntent('play my gym playlist')).toEqual({ kind: 'play', query: 'my gym playlist' })
    expect(musicBoxIntent('Put on some lo-fi')).toEqual({ kind: 'play', query: 'some lo-fi' })
    expect(musicBoxIntent('Bohemian Rhapsody')).toEqual({ kind: 'play', query: 'Bohemian Rhapsody' })
  })
  it('sends questions and other requests to Echo', () => {
    expect(musicBoxIntent('what do I listen to most?')).toEqual({ kind: 'echo' })
    expect(musicBoxIntent('remind me to buy headphones tomorrow')).toEqual({ kind: 'echo' })
    expect(musicBoxIntent('I felt great after the gym today and want to remember it')).toEqual({ kind: 'echo' })
    expect(musicBoxIntent('   ')).toEqual({ kind: 'echo' })
  })
})

describe('brainLine', () => {
  it('counts this week’s memories', () => {
    expect(brainLine(4)).toBe('4 memories this week')
    expect(brainLine(1)).toBe('1 memory this week')
    expect(brainLine(0)).toBe('No new memories this week')
  })
})
