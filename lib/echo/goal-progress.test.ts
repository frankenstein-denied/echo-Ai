import { describe, expect, it } from 'vitest'
import { goalProgress, progressFixes, goalWrite, hasSubgoals, isGoalDone, MIN_SUBGOALS, subgoalCount, subgoalLine } from './goal-progress'

const m = (text: string, done = false) => ({ text, done })

describe('MIN_SUBGOALS', () => {
  it('is 2', () => expect(MIN_SUBGOALS).toBe(2))
})

describe('hasSubgoals', () => {
  it('needs at least two non-empty sub-goals', () => {
    expect(hasSubgoals({})).toBe(false)
    expect(hasSubgoals({ milestones: [] })).toBe(false)
    expect(hasSubgoals({ milestones: [m('a')] })).toBe(false)
    expect(hasSubgoals({ milestones: [m('a'), m('  ')] })).toBe(false)
    expect(hasSubgoals({ milestones: [m('a'), m('b')] })).toBe(true)
  })
  it('ignores junk entries', () => {
    expect(hasSubgoals({ milestones: [m('a'), {} as never, null as never] })).toBe(false)
    expect(hasSubgoals({ milestones: 'nope' as never })).toBe(false)
  })
})

describe('subgoalCount', () => {
  it('counts done and total non-empty sub-goals', () => {
    expect(subgoalCount({ milestones: [m('a', true), m('b'), m('', true)] })).toEqual({ done: 1, total: 2 })
    expect(subgoalCount({})).toEqual({ done: 0, total: 0 })
  })
})

describe('goalProgress', () => {
  it('with sub-goals: done ÷ total, rounded, equal shares', () => {
    expect(goalProgress({ milestones: [m('a', true), m('b')] })).toBe(50)
    expect(goalProgress({ milestones: [m('a', true), m('b', true), m('c')] })).toBe(67)
    expect(goalProgress({ milestones: [m('a', true), m('b'), m('c')] })).toBe(33)
    expect(goalProgress({ milestones: [m('a'), m('b')] })).toBe(0)
    expect(goalProgress({ milestones: [m('a', true), m('b', true)] })).toBe(100)
  })
  it('with sub-goals the stored progress is ignored', () => {
    expect(goalProgress({ progress: 100, milestones: [m('a'), m('b')] })).toBe(0)
    expect(goalProgress({ progress: 10, milestones: [m('a', true), m('b', true)] })).toBe(100)
  })
  it('without sub-goals: done (100) or not done (0)', () => {
    expect(goalProgress({ progress: 100 })).toBe(100)
    expect(goalProgress({ progress: 100, milestones: [] })).toBe(100)
    expect(goalProgress({ progress: 99 })).toBe(0)
    expect(goalProgress({ progress: 50 })).toBe(0)
    expect(goalProgress({ progress: 0 })).toBe(0)
    expect(goalProgress({})).toBe(0)
    expect(goalProgress({ progress: NaN })).toBe(0)
    expect(goalProgress({ progress: 250 })).toBe(100)
  })
  it('one sub-goal behaves like none (its own done state does not count)', () => {
    expect(goalProgress({ progress: 0, milestones: [m('a', true)] })).toBe(0)
    expect(goalProgress({ progress: 100, milestones: [m('a')] })).toBe(100)
  })
})

describe('isGoalDone', () => {
  it('is true only at 100', () => {
    expect(isGoalDone({ progress: 100 })).toBe(true)
    expect(isGoalDone({ progress: 70 })).toBe(false)
    expect(isGoalDone({ milestones: [m('a', true), m('b', true)] })).toBe(true)
    expect(isGoalDone({ progress: 100, milestones: [m('a', true), m('b')] })).toBe(false)
  })
})

describe('subgoalLine', () => {
  it('says n of m sub-goals, or done / not done', () => {
    expect(subgoalLine({ milestones: [m('a', true), m('b'), m('c')] })).toBe('1 of 3 sub-goals')
    expect(subgoalLine({ progress: 100 })).toBe('Done')
    expect(subgoalLine({ progress: 0 })).toBe('Not done yet')
    expect(subgoalLine({ progress: 0, milestones: [m('a')] })).toBe('Not done yet')
  })
})

describe('goalWrite', () => {
  it('derives progress from new sub-goals', () => {
    const next = [m('a', true), m('b'), m('c')]
    expect(goalWrite({ progress: 0, milestones: [] }, { milestones: next })).toEqual({ milestones: next, progress: 33 })
  })
  it('ignores a requested progress when there are sub-goals', () => {
    expect(goalWrite({ progress: 0, milestones: [m('a'), m('b')] }, { progress: 100 })).toEqual({ progress: 0 })
  })
  it('maps a requested progress to 100 only at 100, else 0, without sub-goals', () => {
    expect(goalWrite({ progress: 0, milestones: [] }, { progress: 100 })).toEqual({ progress: 100 })
    expect(goalWrite({ progress: 0, milestones: [] }, { progress: 80 })).toEqual({ progress: 0 })
    expect(goalWrite({ progress: 100, milestones: [] }, { progress: 40 })).toEqual({ progress: 0 })
  })
  it('keeps the done state of a goal without sub-goals when nothing about it changes', () => {
    expect(goalWrite({ progress: 100, milestones: [] }, {})).toEqual({ progress: 100 })
    expect(goalWrite({ progress: 100, milestones: [] }, { milestones: [m('a')] })).toEqual({ milestones: [m('a')], progress: 100 })
  })
  it('removing all sub-goals keeps the goal done only when every sub-goal was done', () => {
    expect(goalWrite({ progress: 100, milestones: [m('a', true), m('b', true)] }, { milestones: [] })).toEqual({ milestones: [], progress: 100 })
    expect(goalWrite({ progress: 50, milestones: [m('a', true), m('b')] }, { milestones: [] })).toEqual({ milestones: [], progress: 0 })
  })
  it('a stale stored progress is not trusted when sub-goals exist', () => {
    expect(goalWrite({ progress: 100, milestones: [m('a'), m('b')] }, { milestones: [] })).toEqual({ milestones: [], progress: 0 })
  })
  it('combines a requested progress with new milestones (new milestones decide)', () => {
    expect(goalWrite({ progress: 0, milestones: [] }, { progress: 100, milestones: [m('a', true), m('b')] })).toEqual({ milestones: [m('a', true), m('b')], progress: 50 })
    expect(goalWrite({ progress: 0, milestones: [] }, { progress: 100, milestones: [m('a')] })).toEqual({ milestones: [m('a')], progress: 100 })
  })
})

describe('progressFixes', () => {
  it('lists only goals whose stored progress differs from the derived one', () => {
    const fixes = progressFixes([
      { id: 'a', progress: 50, milestones: [] },
      { id: 'b', progress: 50, milestones: [m('x', true), m('y')] },
      { id: 'c', progress: 100, milestones: [] },
      { id: 'd', progress: 10, milestones: [m('x', true), m('y', true), m('z')] },
      { id: 'e', milestones: [] } as never,
      { id: 'f', progress: 33.3, milestones: [m('x', true), m('y'), m('z')] },
    ])
    expect(fixes).toEqual([
      { id: 'a', progress: 0 },
      { id: 'd', progress: 67 },
      { id: 'e', progress: 0 },
      { id: 'f', progress: 33 },
    ])
  })
})
