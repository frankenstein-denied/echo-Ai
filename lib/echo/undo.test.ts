import { describe, expect, it, vi } from 'vitest'
import { createUndoStore, restoreData, undoLabel, UNDO_MS } from './undo'

describe('undo store', () => {
  const entry = { kind: 'reminder' as const, docId: 'abc', title: 'Stretch', data: { title: 'Stretch', done: false } }
  it('keeps an entry for 10 s and returns it once', () => {
    let t = 1000
    const store = createUndoStore({ now: () => t })
    const e = store.push(entry)
    expect(e.expiresAt).toBe(1000 + UNDO_MS)
    expect(store.list()).toHaveLength(1)
    t += 9000
    expect(store.take(e.key)).toMatchObject({ docId: 'abc' })
    expect(store.take(e.key)).toBeNull()
    expect(store.list()).toEqual([])
  })
  it('expires entries and refuses expired takes', () => {
    let t = 0
    const store = createUndoStore({ now: () => t })
    const a = store.push(entry)
    const b = store.push({ ...entry, docId: 'def' })
    t = UNDO_MS + 1
    expect(store.take(a.key)).toBeNull()
    expect(store.expire().map((x) => x.docId)).toEqual(['def'])
    expect(store.list()).toEqual([])
    expect(b.key).toBeGreaterThan(a.key)
  })
  it('notifies subscribers and caps the queue', () => {
    const store = createUndoStore({ max: 2 })
    const fn = vi.fn()
    const off = store.subscribe(fn)
    store.push(entry)
    store.push(entry)
    store.push(entry)
    expect(store.list()).toHaveLength(2)
    expect(fn).toHaveBeenCalledTimes(3)
    off()
    store.push(entry)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe('restoreData', () => {
  it('keeps only the fields the create rule allows (timestamps are re-stamped by the writer)', () => {
    const dueAt = { seconds: 1 }
    expect(restoreData('reminder', { title: 'Stretch', dueAt, done: false, source: 'chat', createdAt: 1, updatedAt: 2, extra: 'x' })).toEqual({ title: 'Stretch', dueAt, done: false, source: 'chat' })
    expect(restoreData('goal', { title: 'G', category: 'Health', progress: 10, streak: 0, milestones: [], createdAt: 1 })).toEqual({ title: 'G', category: 'Health', progress: 10, streak: 0, milestones: [] })
    expect(restoreData('meal', { date: '2026-10-26', mealType: 'lunch', description: 'rice', items: [], totalCalories: 200, source: 'chat', estimated: true, updatedAt: 3 })).toEqual({
      date: '2026-10-26',
      mealType: 'lunch',
      description: 'rice',
      items: [],
      totalCalories: 200,
      source: 'chat',
      estimated: true,
    })
    expect(restoreData('note', { title: 'N', body: 'b', category: 'Diary', tags: [], targetDate: undefined })).toEqual({ title: 'N', body: 'b', category: 'Diary', tags: [] })
  })
  it('labels', () => {
    expect(undoLabel({ kind: 'note', title: 'Trip ideas' })).toBe('Deleted note "Trip ideas"')
  })
})
