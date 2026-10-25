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
      { label: 'Mama', type: 'person', links: [{ label: 'Family', type: 'topic' }, { label: 'Mama', type: 'person' }] },
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
    expect(out[0]).toEqual({ label: 'Mama', type: 'person', linkIds: [] })
    expect(out[1].linkIds).toEqual(['person-mama'])
    expect(out[2].label).toHaveLength(60)
    expect(out.some((m) => m.label === 'Bad')).toBe(false)
  })

  describe('link resolution', () => {
    const ctx = [
      { label: 'Alex', type: 'person', mentions: 2 },
      { label: 'Running', type: 'interest', mentions: 3 },
      { label: 'Half marathon', type: 'goal', mentions: 1 },
      { label: 'Report', type: 'task', mentions: 1 },
      { label: 'Checkup', type: 'health', mentions: 1 },
      { label: 'Day one', type: 'diary', mentions: 1 },
      { label: 'Calendar', type: 'connector', mentions: 1 },
      { label: 'Sleep', type: 'topic', mentions: 1 },
    ]
    const run = (memories: unknown[]) => sanitizeEchoResponse({ reply: 'x', actions: [], memories, trace: [] }, NOW, '09:00', ctx).memories

    it('resolves existing context memories of every type to <type>-<slug> ids', () => {
      const targets = ctx.map((c) => ({ label: c.label, type: c.type }))
      const out = run([{ label: 'Knee', type: 'topic', links: targets }])
      expect(out[0].linkIds).toEqual([
        'person-alex', 'interest-running', 'goal-half-marathon', 'task-report', 'health-checkup', 'diary-day-one', 'connector-calendar', 'topic-sleep',
      ])
    })

    it('links to memories in the same response', () => {
      const out = run([
        { label: 'Alex', type: 'person', links: [{ label: 'Running', type: 'interest' }] },
        { label: 'Running', type: 'interest', links: [] },
      ])
      expect(out[0].linkIds).toEqual(['interest-running'])
    })

    it('drops unknown targets and invalid types instead of guessing topic', () => {
      const out = run([
        { label: 'Knee', type: 'topic', links: [{ label: 'Nobody', type: 'person' }, 5, null, { label: '!!!', type: 'topic' }] },
      ])
      expect(out[0].linkIds).toEqual([])
    })

    it('adopts the existing memory when the model picks a different type for the same slug', () => {
      const out = run([
        { label: 'running', type: 'topic', links: [{ label: 'Running', type: 'topic' }, { label: 'Alex', type: 'interest' }] },
        { label: 'Health', type: 'topic', links: [{ label: 'Sleep', type: 'health' }] },
      ])
      expect(out[0]).toEqual({ label: 'Running', type: 'interest', linkIds: ['person-alex'] })
      expect(out[1].linkIds).toEqual(['topic-sleep'])
    })

    it('keeps distinct types when the slug is ambiguous in context or duplicated in the response', () => {
      const amb = sanitizeEchoResponse({ reply: 'x', actions: [], memories: [{ label: 'Mama', type: 'topic', links: [] }], trace: [] }, NOW, '09:00', [
        { label: 'Mama', type: 'person' },
        { label: 'Mama', type: 'interest' },
      ]).memories
      expect(amb[0]).toMatchObject({ label: 'Mama', type: 'topic' })
      const dup = sanitizeEchoResponse({ reply: 'x', actions: [], memories: [{ label: 'Mama', type: 'person', links: [] }, { label: 'Mama', type: 'topic', links: [] }], trace: [] }, NOW, '09:00', [
        { label: 'Mama', type: 'person' },
      ]).memories
      expect(dup.map((m) => m.type)).toEqual(['person', 'topic'])
    })

    it('resolves bare label strings only when unambiguous', () => {
      const out = run([{ label: 'Knee', type: 'topic', links: ['Alex', 'alex', 'Nobody'] }])
      expect(out[0].linkIds).toEqual(['person-alex'])
    })

    it('links otherwise-isolated memories to the primary one (co-occurrence)', () => {
      const out = run([
        { label: 'Running', type: 'interest', links: [] },
        { label: 'Knee', type: 'topic', links: [] },
        { label: 'Alex', type: 'person', links: [] },
        { label: 'Sleep', type: 'topic', links: [{ label: 'Alex', type: 'person' }] },
      ])
      expect(out[0].linkIds).toEqual([])
      expect(out[1].linkIds).toEqual(['interest-running'])
      expect(out[2].linkIds).toEqual([])
      expect(out[3].linkIds).toEqual(['person-alex'])
    })

    it('does not co-link a memory that is already targeted by another', () => {
      const out = run([
        { label: 'Running', type: 'interest', links: [] },
        { label: 'Knee', type: 'topic', links: [{ label: 'Alex', type: 'person' }] },
        { label: 'Alex', type: 'person', links: [] },
      ])
      expect(out[2].linkIds).toEqual([])
    })

    it('caps links per memory at 8 and drops self links', () => {
      const memories = Array.from({ length: 10 }, (_, i) => ({ label: `T${i}`, type: 'topic', links: [] }))
      const links = memories.map((m) => ({ label: m.label, type: m.type }))
      const out = run([{ label: 'Hub', type: 'topic', links: [{ label: 'Hub', type: 'topic' }, ...links] }, ...memories.slice(0, 9)])
      expect(out[0].linkIds).toHaveLength(8)
      expect(out[0].linkIds).not.toContain('topic-hub')
    })
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
