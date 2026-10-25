import { describe, expect, it } from 'vitest'
import { extractCheckInTime } from './prompt'
import { parseEchoRequest, REMINDER_DROPPED_TRACE, sanitizeEchoResponse, slugifyLabel } from './sanitize'

const NOW = '2026-10-25T19:42:00+08:00'
const base = { text: 'hello', clientTime: NOW, timeZone: 'Asia/Manila' }
const resp = (actions: unknown[], extra: Record<string, unknown> = {}) =>
  sanitizeEchoResponse({ reply: 'ok', actions, memories: [], trace: [], ...extra }, NOW, '09:00')

describe('parseEchoRequest', () => {
  it('accepts a minimal valid body', () => {
    const r = parseEchoRequest(base)
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.context).toEqual({ profile: '', recentMessages: [], memoryLabels: [] })
  })

  it('rejects bad bodies', () => {
    expect(parseEchoRequest(null)).toHaveProperty('error')
    expect(parseEchoRequest([])).toHaveProperty('error')
    expect(parseEchoRequest({ ...base, text: '   ' })).toHaveProperty('error')
    expect(parseEchoRequest({ ...base, text: 5 })).toHaveProperty('error')
    expect(parseEchoRequest({ ...base, text: 'x'.repeat(2001) })).toHaveProperty('error')
    expect(parseEchoRequest({ ...base, clientTime: 'yesterday' })).toHaveProperty('error')
    expect(parseEchoRequest({ ...base, clientTime: '2026-10-25T19:42:00' })).toHaveProperty('error')
    expect(parseEchoRequest({ ...base, timeZone: '' })).toHaveProperty('error')
  })

  it('accepts text of exactly 2000 chars', () => {
    expect('error' in parseEchoRequest({ ...base, text: 'x'.repeat(2000) })).toBe(false)
  })

  it('truncates context to caps', () => {
    const r = parseEchoRequest({
      ...base,
      context: {
        profile: 'p'.repeat(2000),
        recentMessages: Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', text: 't'.repeat(900) })),
        memoryLabels: Array.from({ length: 60 }, (_, i) => ({ label: `L${i}`, type: 'person', mentions: 2 })),
      },
    })
    if ('error' in r) throw new Error(r.error)
    expect(r.context.profile).toHaveLength(1500)
    expect(r.context.recentMessages).toHaveLength(10)
    expect(r.context.recentMessages[0].text).toHaveLength(500)
    expect(r.context.memoryLabels).toHaveLength(40)
  })

  it('drops malformed context entries', () => {
    const r = parseEchoRequest({
      ...base,
      context: {
        recentMessages: [{ role: 'system', text: 'x' }, { role: 'user', text: 'ok' }, 'junk'],
        memoryLabels: [{ label: '', type: 'person', mentions: 1 }, { label: 'Mama', type: 'person', mentions: 'a' }],
      },
    })
    if ('error' in r) throw new Error(r.error)
    expect(r.context.recentMessages).toEqual([{ role: 'user', text: 'ok' }])
    expect(r.context.memoryLabels).toEqual([{ label: 'Mama', type: 'person', mentions: 0 }])
  })
})

describe('action validation', () => {
  it('accepts each valid action type', () => {
    const out = resp([
      { type: 'note', title: 'Rough day', body: 'Felt ignored', category: 'Diary', tags: ['Work', 'work', 'mood'] },
      { type: 'goal', title: 'Half marathon', category: 'Health', targetDate: '2027-03-01' },
      { type: 'health', date: '2026-10-25', mood: 4, sleepMinutes: 360, waterGlasses: 3, energy: 'low' },
      { type: 'reminder', title: 'Call Mama', dueAt: '2026-10-25T20:30:00+08:00' },
      { type: 'connector', provider: 'Google Calendar', request: 'Add dentist Friday' },
    ])
    expect(out.actions.map((a) => a.type)).toEqual(['note', 'goal', 'health', 'reminder', 'connector'])
    expect(out.actions[0]).toMatchObject({ tags: ['work', 'mood'] })
    expect(out.actions[1]).toMatchObject({ targetDate: '2027-03-01' })
    expect(out.actions[3]).toMatchObject({ dueAt: '2026-10-25T20:30:00+08:00' })
  })

  it('keeps a lone general action', () => {
    expect(resp([{ type: 'general' }]).actions).toEqual([{ type: 'general' }])
  })

  it('drops general when real actions exist', () => {
    const out = resp([{ type: 'general' }, { type: 'connector', provider: 'Spotify', request: 'play jazz' }])
    expect(out.actions.map((a) => a.type)).toEqual(['connector'])
  })

  it('drops invalid actions', () => {
    const out = resp([
      null,
      'str',
      { type: 'nope' },
      { type: 'note', title: '', body: 'x' },
      { type: 'note', title: 'x' },
      { type: 'goal' },
      { type: 'health' },
      { type: 'health', date: 'tomorrow', mood: 5 },
      { type: 'health', date: '2026-02-30', mood: 5 },
      { type: 'reminder', dueAt: '2026-10-26T10:00:00+08:00' },
      { type: 'connector', provider: 'Spotify' },
    ])
    expect(out.actions).toEqual([])
  })

  it('ignores an invalid goal targetDate but keeps the goal', () => {
    const out = resp([{ type: 'goal', title: 'Read more', category: 'Learning', targetDate: 'soon' }])
    expect(out.actions[0]).toEqual({ type: 'goal', title: 'Read more', category: 'Learning' })
  })

  it('defaults health date to the client date and note category to Diary', () => {
    const out = resp([{ type: 'health', mood: 7 }, { type: 'note', title: 'a', body: 'b' }])
    expect(out.actions[0]).toEqual({ type: 'health', date: '2026-10-25', mood: 7 })
    expect(out.actions[1]).toMatchObject({ category: 'Diary', tags: [] })
  })

  it('does not take the wrong client date near midnight offsets', () => {
    const out = sanitizeEchoResponse({ reply: 'x', actions: [{ type: 'health', mood: 5 }] }, '2026-10-25T01:00:00+08:00', '09:00')
    expect(out.actions[0]).toMatchObject({ date: '2026-10-25' })
  })

  it('clamps numbers', () => {
    const out = resp([{ type: 'health', mood: 15, sleepMinutes: 9999, waterGlasses: -2, energy: 'huge' }])
    expect(out.actions[0]).toEqual({ type: 'health', date: '2026-10-25', mood: 10, sleepMinutes: 1440, waterGlasses: 0 })
    const low = resp([{ type: 'health', mood: -3.4, sleepMinutes: 360.6 }])
    expect(low.actions[0]).toMatchObject({ mood: 1, sleepMinutes: 361 })
  })

  it('ignores non-finite or non-number metrics', () => {
    expect(resp([{ type: 'health', mood: 'happy', sleepMinutes: NaN }]).actions).toEqual([])
  })
})

describe('reminder dueAt', () => {
  const due = (a: Record<string, unknown>, checkIn = '09:00') =>
    (sanitizeEchoResponse({ reply: 'x', actions: [{ type: 'reminder', title: 't', ...a }] }, NOW, checkIn).actions[0] as { dueAt: string }).dueAt

  it('applies fuzzy defaults for date-only values', () => {
    expect(due({ dueAt: '2026-10-26', fuzzyTime: 'morning' })).toBe('2026-10-26T09:00:00+08:00')
    expect(due({ dueAt: '2026-10-26', fuzzyTime: 'afternoon' })).toBe('2026-10-26T14:00:00+08:00')
    expect(due({ dueAt: '2026-10-26', fuzzyTime: 'evening' })).toBe('2026-10-26T20:00:00+08:00')
    expect(due({ dueAt: '2026-10-26', fuzzyTime: 'tonight' })).toBe('2026-10-26T20:00:00+08:00')
  })

  it('uses the check-in time for a date-only dueAt', () => {
    expect(due({ dueAt: '2026-10-27' }, '07:30')).toBe('2026-10-27T07:30:00+08:00')
  })

  it('uses a fuzzyTime alone (today, or tomorrow if past)', () => {
    expect(due({ fuzzyTime: 'tonight' })).toBe('2026-10-25T20:00:00+08:00')
    expect(due({ fuzzyTime: 'morning' })).toBe('2026-10-26T09:00:00+08:00')
  })

  it('drops a reminder with neither dueAt nor fuzzyTime and adds a trace line', () => {
    for (const extra of [{}, { dueAt: 'tonight at 8' }, { dueAt: '' }]) {
      const out = sanitizeEchoResponse({ reply: 'x', actions: [{ type: 'reminder', title: 't', ...extra }], trace: ['a'] }, NOW, '07:30')
      expect(out.actions).toEqual([])
      expect(out.trace).toEqual(['a', REMINDER_DROPPED_TRACE])
    }
  })

  it('falls back to 09:00 for a bad check-in time', () => {
    expect(due({ dueAt: '2026-10-27' }, 'later')).toBe('2026-10-27T09:00:00+08:00')
  })

  it('moves a past time to the same time tomorrow', () => {
    expect(due({ dueAt: '2026-10-25T08:00:00+08:00' })).toBe('2026-10-26T08:00:00+08:00')
  })

  it('treats a missing offset as client-local and keeps future times', () => {
    expect(due({ dueAt: '2026-10-25T21:15:00' })).toBe('2026-10-25T21:15:00+08:00')
  })

  it('converts other offsets into the client offset', () => {
    expect(due({ dueAt: '2026-10-25T13:30:00Z' })).toBe('2026-10-25T21:30:00+08:00')
  })

  it('handles negative offsets', () => {
    const out = sanitizeEchoResponse(
      { reply: 'x', actions: [{ type: 'reminder', title: 't', dueAt: '2026-10-25T20:00:00-05:00' }] },
      '2026-10-25T19:00:00-05:00',
      '09:00',
    )
    expect(out.actions[0]).toMatchObject({ dueAt: '2026-10-25T20:00:00-05:00' })
  })
})

describe('memories, reply, trace', () => {
  it('slugs labels', () => {
    expect(slugifyLabel('Mama')).toBe('mama')
    expect(slugifyLabel('  Café  Time! ')).toBe('cafe-time')
    expect(slugifyLabel('???')).toBe('')
  })

  it('validates, de-duplicates and caps memories', () => {
    const memories = [
      { label: 'Mama', type: 'person', links: ['Family', 'Mama', 'Family'] },
      { label: 'mama', type: 'person', links: [] },
      { label: 'Mama', type: 'topic', links: [] },
      { label: 'x'.repeat(100), type: 'interest', links: [] },
      { label: 'Bad', type: 'alien', links: [] },
      { label: '', type: 'person', links: [] },
      { label: '!!!', type: 'person', links: [] },
      ...Array.from({ length: 20 }, (_, i) => ({ label: `Topic ${i}`, type: 'topic', links: [] })),
    ]
    const out = resp([], { memories }).memories
    expect(out).toHaveLength(10)
    expect(out[0]).toEqual({ label: 'Mama', type: 'person', links: ['Family'] })
    expect(out[1]).toEqual({ label: 'Mama', type: 'topic', links: [] })
    expect(out[2].label).toHaveLength(60)
    expect(out.some((m) => m.label === 'Bad')).toBe(false)
  })

  it('caps the reply at 1200 chars', () => {
    expect(resp([], { reply: 'a'.repeat(3000) }).reply).toHaveLength(1200)
  })

  it('survives garbage input', () => {
    expect(sanitizeEchoResponse(null, NOW, '09:00')).toEqual({ reply: '', actions: [], memories: [], trace: [] })
    expect(sanitizeEchoResponse({ actions: 'x', memories: 4, trace: 'y' }, NOW, '09:00').actions).toEqual([])
  })

  it('cleans trace lines', () => {
    expect(resp([], { trace: ['Classified as Reminder', '', 5, 'x'.repeat(500)] }).trace.map((t) => t.length)).toEqual([22, 160])
  })
})

describe('extractCheckInTime', () => {
  it('reads the check-in line', () => {
    expect(extractCheckInTime('Name: Peter\nCheck-in time: 08:00')).toBe('08:00')
  })

  it('defaults when absent', () => {
    expect(extractCheckInTime('Name: Peter')).toBe('09:00')
    expect(extractCheckInTime('')).toBe('09:00')
  })

  it('rejects malformed minutes', () => {
    expect(extractCheckInTime('Check-in time: 9:5')).toBe('09:00')
  })

  it('pads a single-digit hour', () => {
    expect(extractCheckInTime('Check-in time: 7:30')).toBe('07:30')
  })
})
