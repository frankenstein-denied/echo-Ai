import { describe, expect, it } from 'vitest'
import { mergeLinks, mergePages, planReciprocalLinks } from './links'

describe('planReciprocalLinks', () => {
  it('adds the back link for every A -> B, including targets outside the response', () => {
    const plan = planReciprocalLinks([
      { id: 'a', linkIds: ['b', 'ext'] },
      { id: 'b', linkIds: ['a', 'c'] },
      { id: 'c', linkIds: [] },
    ])
    expect(plan.get('b')).toEqual(['a'])
    expect(plan.get('ext')).toEqual(['a'])
    expect(plan.get('a')).toEqual(['b'])
    expect(plan.get('c')).toEqual(['b'])
  })

  it('ignores self links and duplicates', () => {
    const plan = planReciprocalLinks([{ id: 'a', linkIds: ['a', 'b', 'b'] }])
    expect(plan.get('a')).toBeUndefined()
    expect(plan.get('b')).toEqual(['a'])
  })
})

describe('mergeLinks', () => {
  it('dedupes and keeps the newest up to the cap', () => {
    expect(mergeLinks(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(mergeLinks(['a', 'b', 'c'], ['d'], 3)).toEqual(['b', 'c', 'd'])
  })
})

import { buildReciprocalUpdate } from './links'

describe('buildReciprocalUpdate', () => {
  it('leaves mentions alone when present', () => {
    expect(buildReciprocalUpdate({ links: ['x'], mentions: 3 }, ['a'])).toEqual({ links: ['x', 'a'] })
  })
  it('sets mentions: 1 on legacy docs without mentions', () => {
    expect(buildReciprocalUpdate({ links: ['x'] }, ['a'])).toEqual({ links: ['x', 'a'], mentions: 1 })
    expect(buildReciprocalUpdate({}, ['a'])).toEqual({ links: ['a'], mentions: 1 })
  })
  it('returns null when nothing new', () => {
    expect(buildReciprocalUpdate({ links: ['a'], mentions: 1 }, ['a'])).toBeNull()
  })
})

describe('mergePages', () => {
  it('starts a list from undefined', () => {
    expect(mergePages(undefined, 'p1')).toEqual(['p1'])
  })
  it('moves an existing id to the end', () => {
    expect(mergePages(['p1', 'p2', 'p3'], 'p1')).toEqual(['p2', 'p3', 'p1'])
  })
  it('caps at 50, dropping the oldest', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `p${i}`)
    const out = mergePages(ids, 'new')
    expect(out).toHaveLength(50)
    expect(out[0]).toBe('p1')
    expect(out[49]).toBe('new')
  })
})
