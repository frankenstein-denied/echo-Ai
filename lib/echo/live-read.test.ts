import { describe, expect, it } from 'vitest'
import { buildSnapshot, capJson, humanTime, localDate, parseRange, RESULT_MAX_BYTES, searchNotes, shapeGoals, shapeHealth, shapeMemories, shapeReminders } from './live-read'

const TZ = 'Asia/Manila' // UTC+8, no DST
const NOW = Date.parse('2026-10-25T14:00:00+08:00')
const at = (iso: string) => Date.parse(iso)
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length

describe('capJson', () => {
  it('drops items from the end until the JSON fits', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ i, pad: 'x'.repeat(50) }))
    const out = capJson(items, 500)
    expect(bytes(out)).toBeLessThanOrEqual(500)
    expect(out[0].i).toBe(0)
    expect(out.length).toBeGreaterThan(3)
  })
})

describe('shapeGoals', () => {
  it('newest first, progress clamped, milestones done/total, optional targetDate', () => {
    const out = shapeGoals([
      { title: 'Old', category: 'Health', progress: 40, milestones: [{ done: true }, { done: false }], updatedAtMs: 1 },
      { title: 'New', progress: 140, targetDate: '2027-03-01', updatedAtMs: 2 },
    ])
    expect(out).toEqual([
      { title: 'New', category: 'Personal', progress: 100, targetDate: '2027-03-01', milestones: '0/0' },
      { title: 'Old', category: 'Health', progress: 40, milestones: '1/2' },
    ])
  })
  it('stays under the size cap', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ title: `Goal ${i} ${'y'.repeat(90)}`, progress: i, updatedAtMs: i }))
    const out = shapeGoals(many)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(bytes(out)).toBeLessThanOrEqual(RESULT_MAX_BYTES)
  })
})

describe('shapeReminders', () => {
  const rems = [
    { title: 'Past today', dueAtMs: at('2026-10-25T09:00:00+08:00'), done: true },
    { title: 'Tonight', dueAtMs: at('2026-10-25T20:00:00+08:00') },
    { title: 'Tomorrow', dueAtMs: at('2026-10-26T07:00:00+08:00') },
    { title: 'Done later', dueAtMs: at('2026-10-27T07:00:00+08:00'), done: true },
    { title: 'Yesterday', dueAtMs: at('2026-10-24T23:30:00+08:00') },
  ]
  it('today = local day (done or not), soonest first, human local time', () => {
    expect(shapeReminders(rems, 'today', NOW, TZ)).toEqual([
      { title: 'Past today', dueAt: humanTime(rems[0].dueAtMs, TZ), done: true },
      { title: 'Tonight', dueAt: 'Sun, Oct 25, 8:00 PM', done: false },
    ])
  })
  it('upcoming = not done and in the future, soonest first; all = newest first', () => {
    expect(shapeReminders(rems, 'upcoming', NOW, TZ).map((r) => r.title)).toEqual(['Tonight', 'Tomorrow'])
    expect(shapeReminders(rems, 'all', NOW, TZ).map((r) => r.title)).toEqual(['Done later', 'Tomorrow', 'Tonight', 'Past today', 'Yesterday'])
  })
  it('parses range with an upcoming default', () => {
    expect(parseRange('today')).toBe('today')
    expect(parseRange('all')).toBe('all')
    expect(parseRange('nope')).toBe('upcoming')
    expect(parseRange(undefined)).toBe('upcoming')
  })
})

describe('searchNotes', () => {
  const notes = [
    { title: 'Run log', body: 'Ran 5k along the river. Knee felt fine.', category: 'Health', tags: ['running'], updatedAtMs: at('2026-10-20T10:00:00+08:00') },
    { title: 'Mama call', body: `${'Long day. '.repeat(40)}Called Mama about the knee doctor.`, category: 'Family', tags: [], updatedAtMs: at('2026-10-24T10:00:00+08:00') },
    { title: 'Work', body: 'Thesis chapter 3', category: 'Work', tags: ['thesis'], updatedAtMs: at('2026-10-25T10:00:00+08:00') },
  ]
  it('matches title/body/tags, ranks by matched terms then recency, snippets around the hit (<= 200 chars)', () => {
    const out = searchNotes(notes, 'Mama knee', 5, TZ)
    expect(out.map((n) => n.title)).toEqual(['Mama call', 'Run log'])
    expect(out[0].snippet.length).toBeLessThanOrEqual(200)
    expect(out[0].snippet).toContain('Called Mama')
    expect(out[0].updated).toBe('2026-10-24')
    expect(searchNotes(notes, 'running', 5, TZ).map((n) => n.title)).toEqual(['Run log'])
  })
  it('no query = latest notes; limit clamped to 1-10', () => {
    expect(searchNotes(notes, '', 2, TZ).map((n) => n.title)).toEqual(['Work', 'Mama call'])
    expect(searchNotes(notes, undefined, 0, TZ)).toHaveLength(1)
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `n${i}`, body: 'z'.repeat(400), updatedAtMs: i }))
    const out = searchNotes(many, '', 50, TZ)
    expect(out.length).toBeLessThanOrEqual(10)
    expect(bytes(out)).toBeLessThanOrEqual(RESULT_MAX_BYTES)
  })
})

describe('shapeHealth', () => {
  it('last N local days (<= 14), newest first, only fields that exist', () => {
    const logs = [
      { date: '2026-10-25', waterGlasses: 6 },
      { date: '2026-10-23', mood: 7, sleepMinutes: 360, energy: 'low' },
      { date: '2026-10-12', mood: 3 }, // 14th day back
      { date: '2026-10-26', mood: 9 },
    ]
    expect(shapeHealth(logs, 3, '2026-10-25')).toEqual([
      { date: '2026-10-25', waterGlasses: 6 },
      { date: '2026-10-23', mood: 7, sleepMinutes: 360, energy: 'low' },
    ])
    expect(shapeHealth(logs, 99, '2026-10-25')).toHaveLength(3) // capped at 14 days
    expect(shapeHealth(logs, undefined, '2026-10-25')).toHaveLength(2) // default 7
  })
})

describe('shapeMemories', () => {
  const mems = [
    { id: 'person-mama', label: 'Mama', type: 'person', mentions: 5, links: ['topic-knee', 'interest-running'] },
    { id: 'topic-knee', label: 'Knee', type: 'topic', mentions: 2, links: ['person-mama'] },
    { id: 'interest-running', label: 'Running', type: 'interest', mentions: 9, links: ['missing-id'] },
  ]
  it('most mentioned first with linked labels resolved (unknown ids dropped)', () => {
    expect(shapeMemories(mems, undefined)).toEqual([
      { label: 'Running', type: 'interest', mentions: 9, linked: [] },
      { label: 'Mama', type: 'person', mentions: 5, linked: ['Knee', 'Running'] },
      { label: 'Knee', type: 'topic', mentions: 2, linked: ['Mama'] },
    ])
  })
  it('query filters by label, type or linked label', () => {
    expect(shapeMemories(mems, 'knee').map((m) => m.label)).toEqual(['Mama', 'Knee'])
    expect(shapeMemories(mems, 'person').map((m) => m.label)).toEqual(['Mama'])
  })
})

describe('buildSnapshot', () => {
  it('summarizes active goals, today reminders and today health in a few short lines', () => {
    const s = buildSnapshot(
      [{ title: 'Half marathon', progress: 30, updatedAtMs: 2 }, { title: 'Done goal', progress: 100, updatedAtMs: 1 }],
      [{ title: 'Call Mama', dueAtMs: at('2026-10-25T20:30:00+08:00') }],
      [{ date: '2026-10-25', sleepMinutes: 360 }],
      NOW,
      TZ,
    )
    expect(s).toBe('Active goals: Half marathon (30%)\nReminders today: Call Mama at Sun, Oct 25, 8:30 PM\nHealth today: sleepMinutes 360')
  })
  it('falls back to next reminders and says when nothing is there', () => {
    const s = buildSnapshot([], [{ title: 'Dentist', dueAtMs: at('2026-10-27T09:00:00+08:00') }], [], NOW, TZ)
    expect(s).toBe('Active goals: none\nNext reminders: Dentist at Tue, Oct 27, 9:00 AM\nHealth today: nothing logged')
    expect(localDate(NOW, TZ)).toBe('2026-10-25')
  })
})
