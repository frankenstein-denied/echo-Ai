import { describe, expect, it } from 'vitest'
import { CONNECTORS } from './connectors'
import { categoryChips, emptyMessage, filterConnectors, groupByCategory, shownCountText } from './connector-filter'

const ids = (defs: { id: string }[]) => defs.map((d) => d.id)

describe('filterConnectors', () => {
  it('filters by category', () => {
    expect(ids(filterConnectors(CONNECTORS, { category: 'live', query: '' }))).toEqual(['web-search', 'weather'])
  })
  it('all + empty query returns the whole catalog in order', () => {
    expect(ids(filterConnectors(CONNECTORS, { category: 'all', query: '' }))).toEqual(ids([...CONNECTORS]))
  })
  it('query matches name or description, trimmed and case-insensitive', () => {
    expect(ids(filterConnectors(CONNECTORS, { category: 'all', query: ' WEATHER ' }))).toEqual(['weather'])
    expect(ids(filterConnectors(CONNECTORS, { category: 'all', query: 'usda' }))).toEqual(['nutrition'])
    expect(ids(filterConnectors(CONNECTORS, { category: 'all', query: 'emails' }))).toEqual(['gmail'])
  })
  it('query and category combine', () => {
    expect(filterConnectors(CONNECTORS, { category: 'productivity', query: 'weather' })).toEqual([])
  })
  it('regex characters are literal', () => {
    expect(() => filterConnectors(CONNECTORS, { category: 'all', query: '(+\\' })).not.toThrow()
    expect(filterConnectors(CONNECTORS, { category: 'all', query: '(+\\' })).toEqual([])
  })
})

describe('groupByCategory', () => {
  it('drops empty groups and keeps section order', () => {
    const groups = groupByCategory(CONNECTORS)
    expect(groups.map((g) => g.id)).toEqual(['music', 'health', 'productivity', 'live'])
    expect(ids(groups.find((g) => g.id === 'music')!.items)).toEqual(['spotify'])
    expect(groups.find((g) => g.id === 'health')!.label).toBe('Health & Fitness')
  })
  it('returns nothing for an empty list', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('categoryChips', () => {
  it('starts with All and lists only non-empty categories', () => {
    const chips = categoryChips(CONNECTORS)
    expect(chips.map((c) => c.id)).toEqual(['all', 'music', 'health', 'productivity', 'live'])
    expect(chips[0].label).toBe('All')
  })
})

describe('emptyMessage', () => {
  it('names the query, and the category only when one is picked', () => {
    expect(emptyMessage({ category: 'all', query: ' zzz ' })).toBe('No connectors match “zzz”.')
    expect(emptyMessage({ category: 'music', query: 'zzz' })).toBe('No connectors match “zzz” in Music.')
  })
  it('falls back when there is no query', () => {
    expect(emptyMessage({ category: 'ai', query: '  ' })).toBe('No connectors in AI models yet.')
  })
})

describe('shownCountText', () => {
  it('pluralises the count for screen readers', () => {
    expect(shownCountText(0)).toBe('No connectors shown')
    expect(shownCountText(1)).toBe('1 connector shown')
    expect(shownCountText(8)).toBe('8 connectors shown')
  })
})
