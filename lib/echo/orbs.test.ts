import { describe, expect, it } from 'vitest'
import { buildOrbs, buildThreads, filterOrbs, memoryKind, orbAriaLabel, orbBlobs, orbShares, orbSummary, searchOrbs, ORB_KINDS, type Orb, type OrbKind } from './orbs'

const zero = (o: Partial<Record<OrbKind, number>> = {}) => ({ note: 0, goal: 0, reminder: 0, health: 0, person: 0, interest: 0, ...o })

describe('memoryKind', () => {
  it('maps types', () => {
    expect(memoryKind('person')).toBe('person')
    expect(memoryKind('interest')).toBe('interest')
    expect(memoryKind('topic')).toBe('interest')
    expect(memoryKind('goal')).toBe('goal')
    expect(memoryKind('task')).toBe('reminder')
    expect(memoryKind('health')).toBe('health')
    expect(memoryKind('diary')).toBeNull()
    expect(memoryKind(undefined)).toBeNull()
  })
})

describe('buildOrbs', () => {
  const pages = [
    { id: 'p2', title: ' Second ', lastMessageMs: 200, messageCount: 4, mix: { note: 2, goal: 0 } },
    { id: 'p1', lastMessageMs: 100, messageCount: 0, mix: { goal: 1 } },
    { id: 'empty', lastMessageMs: 300, messageCount: 0 },
  ]
  const memories = [
    { id: 'a', label: 'Ana', type: 'person', mentions: 3, pages: ['p2', 'p2', 'p1', 'nope'] },
    { id: 'b', label: 'Bo', type: 'person', mentions: 3, pages: ['p2'] },
    { id: 'g', label: 'Run', type: 'goal', mentions: 1, pages: ['p2'] },
    { id: 'x', label: 'Diary', type: 'diary', pages: ['p2'] },
  ]
  it('builds, dedupes, sorts, skips empties', () => {
    const orbs = buildOrbs(memories, pages)
    expect(orbs.map((o) => o.id)).toEqual(['orb-p1', 'orb-p2'])
    const p2 = orbs[1]
    expect(p2.label).toBe('Second')
    expect(p2.counts).toEqual(zero({ note: 2, goal: 1, person: 2 }))
    expect(p2.members.map((m) => m.label)).toEqual(['Ana', 'Bo', 'Run'])
    expect(p2.involvement).toBe(5 + 1)
    expect(orbs[0].label).toBe('Untitled page')
    expect(orbs[0].counts.person).toBe(1)
  })
  it('uses max of mix and members for goals', () => {
    const o = buildOrbs(memories, [{ id: 'p2', messageCount: 1, mix: { goal: 3 } }])[0]
    expect(o.counts.goal).toBe(3)
  })
  it('clamps radius at both ends', () => {
    expect(buildOrbs([], [{ id: 'q', messageCount: 1 }])[0].radius).toBeGreaterThanOrEqual(16)
    expect(buildOrbs([], [{ id: 'q', messageCount: 1000 }])[0].radius).toBe(60)
    expect(buildOrbs([], [{ id: 'q', messageCount: 1, mix: { note: 1 } }])[0].radius).toBeLessThan(60)
  })
})

describe('orbShares', () => {
  it('sorts, caps at 4, renormalises', () => {
    const s = orbShares(zero({ note: 1, goal: 5, reminder: 3, health: 2, person: 1, interest: 1 }))
    expect(s.map((x) => x.kind)).toEqual(['goal', 'reminder', 'health', 'note'])
    expect(s.reduce((t, x) => t + x.share, 0)).toBeCloseTo(1)
  })
  it('empty', () => expect(orbShares(zero())).toEqual([]))
})

describe('orbBlobs', () => {
  const counts = zero({ note: 4, goal: 2, person: 1, health: 1, interest: 1 })
  it('is deterministic and bounded', () => {
    expect(orbBlobs('orb-a', counts)).toEqual(orbBlobs('orb-a', counts))
    for (const id of ['orb-a', 'orb-b', 'orb-zzz']) {
      for (const c of [counts, zero({ note: 1 }), zero({ note: 1, goal: 1 })]) {
        const blobs = orbBlobs(id, c)
        expect(blobs.length).toBe(orbShares(c).length)
        for (const b of blobs) {
          expect(Math.hypot(b.cx, b.cy)).toBeLessThanOrEqual(0.7)
          expect(b.r).toBeGreaterThan(0)
          expect(b.r).toBeLessThanOrEqual(1.2)
        }
      }
    }
  })
  it('dominant is largest and closest to centre', () => {
    const [first, ...rest] = orbBlobs('orb-a', counts)
    expect(first.kind).toBe('note')
    for (const b of rest) {
      expect(first.r).toBeGreaterThanOrEqual(b.r)
      expect(Math.hypot(first.cx, first.cy)).toBeLessThan(Math.hypot(b.cx, b.cy))
    }
  })
  it('empty', () => expect(orbBlobs('x', zero())).toEqual([]))
})

const mk = (id: string, ms: number, members: Orb['members'], counts = zero(), messageCount = 0, label = id): Orb => ({
  id, pageId: id, label, ms, messageCount, counts, members, involvement: 0, radius: 16,
})
const ana = { id: 'a', label: 'Ana', kind: 'person' as const, mentions: 2 }
const run = { id: 'r', label: 'Running', kind: 'interest' as const, mentions: 5 }

describe('buildThreads', () => {
  it('chains consecutive orbs only', () => {
    const t = buildThreads([mk('o3', 3, [ana]), mk('o1', 1, [ana]), mk('o2', 2, [ana])])
    expect(t.map((x) => [x.source, x.target])).toEqual([['o1', 'o2'], ['o2', 'o3']])
  })
  it('merges via and picks kind of top-mention member', () => {
    const t = buildThreads([mk('o1', 1, [ana, run]), mk('o2', 2, [ana, run])])
    expect(t).toHaveLength(1)
    expect([...t[0].via].sort()).toEqual(['Ana', 'Running'])
    expect(t[0].kind).toBe('interest')
  })
  it('no shared members, no threads', () => expect(buildThreads([mk('o1', 1, [ana]), mk('o2', 2, [run])])).toEqual([]))
})

describe('filterOrbs / searchOrbs', () => {
  const now = new Date(2026, 10, 4, 12)
  const orbs = [
    mk('today', new Date(2026, 10, 4, 9).getTime(), [ana], zero(), 0, 'Wed, Nov 4'),
    mk('old', new Date(2026, 9, 1).getTime(), [run], zero(), 0, 'Old page'),
  ]
  it('filters by period', () => {
    expect(filterOrbs(orbs, 'today', now).map((o) => o.id)).toEqual(['today'])
    expect(filterOrbs(orbs, 'month', now).map((o) => o.id)).toEqual(['today'])
    expect(filterOrbs(orbs, 'all', now)).toHaveLength(2)
  })
  it('searches label and members', () => {
    expect([...searchOrbs(orbs, ' ANA ')]).toEqual(['today'])
    expect([...searchOrbs(orbs, 'runn')]).toEqual(['old'])
    expect([...searchOrbs(orbs, 'old')]).toEqual(['old'])
    expect(searchOrbs(orbs, '  ').size).toBe(0)
  })
})

describe('orbSummary / orbAriaLabel', () => {
  it('singular and plural in kind order', () => {
    const s = orbSummary(zero({ health: 2, note: 1, person: 2 }))
    expect(s.map((x) => x.text)).toEqual(['1 note', '2 health logs', '2 people'])
    expect(s.map((x) => x.kind)).toEqual(['note', 'health', 'person'])
    expect(ORB_KINDS).toHaveLength(6)
  })
  it('aria label', () => {
    expect(orbAriaLabel(mk('o', 1, [ana], zero({ note: 2, goal: 1, person: 1 }), 5, 'Wed, Nov 4'))).toBe('Wed, Nov 4. 2 notes, 1 goal, 1 person: Ana. 5 messages.')
  })
  it('pearl and many people', () => {
    expect(orbAriaLabel(mk('o', 1, [], zero(), 5, 'Wed, Nov 4'))).toBe('Wed, Nov 4. 5 messages.')
    const ppl = ['A', 'B', 'C', 'D', 'E'].map((l) => ({ id: l, label: l, kind: 'person' as const, mentions: 1 }))
    expect(orbAriaLabel(mk('o', 1, ppl, zero({ person: 5 }), 1, 'X'))).toBe('X. 5 people: A, B, C and 2 more. 1 message.')
  })
})
