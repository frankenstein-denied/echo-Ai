import { describe, expect, it } from 'vitest'
import { chunk, defaultPageTitle, filterPages, isPermissionDenied, normalizeTitle, planMigration, previewOf, relativeTime, sortPages } from './diary'

const t = (n: number) => ({ toMillis: () => n })

describe('diary helpers', () => {
  it('formats the default title', () => {
    expect(defaultPageTitle(new Date(2026, 9, 25, 12))).toBe('Sun, Oct 25')
  })
  it('normalizes titles to 1-120 chars', () => {
    expect(normalizeTitle('  Hello  ')).toBe('Hello')
    expect(normalizeTitle('   ')).toBeNull()
    expect(normalizeTitle('x'.repeat(120))).toHaveLength(120)
    expect(normalizeTitle('x'.repeat(121))).toBeNull()
  })
  it('truncates previews to one line of at most 160 chars', () => {
    expect(previewOf('a\n\n b   c')).toBe('a b c')
    const p = previewOf('word '.repeat(100))
    expect(p.length).toBeLessThanOrEqual(160)
    expect(p.endsWith('…')).toBe(true)
    expect(previewOf('x'.repeat(160))).toHaveLength(160)
  })
  it('sorts newest first, pending timestamps on top', () => {
    const s = sortPages([{ title: 'a', preview: '', updatedAt: t(1) }, { title: 'b', preview: '', updatedAt: null }, { title: 'c', preview: '', updatedAt: t(5) }])
    expect(s.map((p) => p.title)).toEqual(['b', 'c', 'a'])
  })
  it('filters by title or preview, case-insensitive', () => {
    const pages = [{ title: 'Work', preview: 'standup' }, { title: 'Sun, Oct 25', preview: 'went for a RUN' }]
    expect(filterPages(pages, ' run ')).toHaveLength(1)
    expect(filterPages(pages, 'work')[0].title).toBe('Work')
    expect(filterPages(pages, '')).toHaveLength(2)
  })
  it('formats relative time', () => {
    const now = new Date(2026, 9, 25, 12).getTime()
    expect(relativeTime(now - 10_000, now)).toBe('just now')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe('yesterday')
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3 days ago')
  })
  it('chunks into batches of at most 400', () => {
    const ids = Array.from({ length: 901 }, (_, i) => String(i))
    expect(chunk(ids).map((b) => b.length)).toEqual([400, 400, 101])
    expect(chunk([])).toEqual([])
  })
  it('plans migration: skips copied ids, deletes all, batches <= 400', () => {
    const ids = Array.from({ length: 850 }, (_, i) => `m${i}`)
    const fresh = planMigration(ids)
    expect(fresh.copyBatches.map((b) => b.length)).toEqual([400, 400, 50])
    expect(fresh.deleteBatches.flat()).toEqual(ids)
    const rerun = planMigration(ids, ids.slice(0, 450))
    expect(rerun.copyBatches.flat()).toEqual(ids.slice(450))
    expect(rerun.deleteBatches.flat()).toHaveLength(850)
    expect(planMigration([]).copyBatches).toEqual([])
  })
  it('detects permission-denied', () => {
    expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true)
    expect(isPermissionDenied(new Error('x'))).toBe(false)
    expect(isPermissionDenied(null)).toBe(false)
  })
})
