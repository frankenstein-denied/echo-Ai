import { describe, expect, it } from 'vitest'
import { categoryOptions, filterByCategory, noteCategories, previewText, relativeDate, sortByUpdated } from './notes-helpers'

describe('notes helpers', () => {
  it('previewText collapses whitespace and truncates', () => {
    expect(previewText('a\n\n  b   c')).toBe('a b c')
    expect(previewText('x'.repeat(300), 10)).toBe('xxxxxxxxxx...')
    expect(previewText('')).toBe('')
  })
  it('noteCategories dedupes case-insensitively in order', () => {
    expect(noteCategories([{ category: 'Diary' }, { category: 'career' }, { category: 'diary' }, { category: ' ' }])).toEqual(['Diary', 'career'])
  })
  it('categoryOptions includes defaults, custom and current', () => {
    const o = categoryOptions(['Travel', 'diary'], 'Recipes')
    expect(o).toContain('Career')
    expect(o).toContain('Travel')
    expect(o).toContain('Recipes')
    expect(o.filter((c) => c.toLowerCase() === 'diary')).toHaveLength(1)
  })
  it('filterByCategory', () => {
    const n = [{ category: 'Diary' }, { category: 'Career' }]
    expect(filterByCategory(n, 'All')).toHaveLength(2)
    expect(filterByCategory(n, 'career')).toEqual([{ category: 'Career' }])
    expect(filterByCategory(n, 'Nope')).toEqual([])
  })
  it('relativeDate', () => {
    const now = 1_000_000_000_000
    expect(relativeDate(now - 5000, now)).toBe('Just now')
    expect(relativeDate(now - 5 * 60000, now)).toBe('5m ago')
    expect(relativeDate(now - 3 * 3600000, now)).toBe('3h ago')
    expect(relativeDate(now - 36 * 3600000, now)).toBe('Yesterday')
    expect(relativeDate(now - 3 * 86400000, now)).toBe('3d ago')
    expect(relativeDate(now - 30 * 86400000, now)).toMatch(/\d/)
  })
  it('sortByUpdated orders by updatedAt then createdAt', () => {
    const t = (n: number) => ({ toMillis: () => n })
    const r = sortByUpdated([{ id: 'a', updatedAt: t(1) }, { id: 'b', createdAt: t(5) }, { id: 'c', updatedAt: t(3), createdAt: t(0) }])
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
})
