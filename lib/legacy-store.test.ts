import { beforeEach, describe, expect, it, vi } from 'vitest'

// A tiny in-memory Firestore: docs keyed by path, every write logged, and paths that deny.
const fake = vi.hoisted(() => {
  const ST = { __serverTimestamp: true }
  class FakeTimestamp {
    constructor(public ms: number) {}
    toMillis() { return this.ms }
    static fromMillis(ms: number) { return new FakeTimestamp(ms) }
  }
  const state = {
    docs: new Map<string, Record<string, unknown>>(),
    ops: [] as { op: 'set' | 'update' | 'delete'; path: string; data?: Record<string, unknown> }[],
    denyRead: new Set<string>(),
    denyWrite: new Set<string>(),
    now: 1_000_000_000_000,
  }
  const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
  // serverTimestamp() lands as a Timestamp of "now" when stored.
  const resolve = (data: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === ST ? new FakeTimestamp(state.now) : v]))
  const write = (op: 'set' | 'update' | 'delete', ref: { path: string }, data?: Record<string, unknown>) => {
    if (state.denyWrite.has(ref.path)) throw denied()
    state.ops.push({ op, path: ref.path, data })
    if (op === 'delete') state.docs.delete(ref.path)
    else if (op === 'set') state.docs.set(ref.path, resolve(data!))
    else state.docs.set(ref.path, { ...(state.docs.get(ref.path) ?? {}), ...resolve(data!) })
  }
  const snap = (path: string) => ({
    id: path.split('/').pop(),
    exists: () => state.docs.has(path),
    data: () => state.docs.get(path),
  })
  return { ST, FakeTimestamp, state, denied, write, snap }
})

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  Timestamp: fake.FakeTimestamp,
  serverTimestamp: () => fake.ST,
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/'), id: segs[segs.length - 1] }),
  collection: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: () => ({}),
  query: (col: { path: string }, ...cs: { field?: string; value?: unknown }[]) => ({ path: col.path, cs }),
  getDoc: async (ref: { path: string }) => {
    if (fake.state.denyRead.has(ref.path)) throw fake.denied()
    return fake.snap(ref.path)
  },
  getDocs: async (q: { path: string; cs?: { field?: string; value?: unknown }[] }) => {
    if (fake.state.denyRead.has(q.path)) throw fake.denied()
    const docs = [...fake.state.docs.keys()]
      .filter(p => p.startsWith(q.path + '/') && !p.slice(q.path.length + 1).includes('/'))
      .map(p => fake.snap(p))
      .filter(s => (q.cs ?? []).every(c => !c.field || s.data()![c.field] === c.value))
    return { docs, size: docs.length }
  },
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => fake.write('set', ref, data),
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    if (!fake.state.docs.has(ref.path)) throw Object.assign(new Error('No document'), { code: 'not-found' })
    fake.write('update', ref, data)
  },
  deleteDoc: async (ref: { path: string }) => fake.write('delete', ref),
  writeBatch: () => {
    const queued: (() => void)[] = []
    const b = {
      set: (ref: { path: string }, data: Record<string, unknown>) => (queued.push(() => fake.write('set', ref, data)), b),
      update: (ref: { path: string }, data: Record<string, unknown>) => (queued.push(() => fake.write('update', ref, data)), b),
      delete: (ref: { path: string }) => (queued.push(() => fake.write('delete', ref)), b),
      commit: async () => {
        // All or nothing, like Firestore.
        const before = new Map(fake.state.docs)
        const opsBefore = fake.state.ops.length
        try { queued.forEach(q => q()) } catch (e) {
          fake.state.docs = before
          fake.state.ops.length = opsBefore
          throw e
        }
      },
    }
    return b
  },
}))

import { hashAnswer, MAX_TRIES, TRY_WINDOW_MS } from '@/lib/echo/legacy'
import {
  addInheritor,
  isReleased,
  removeInheritor,
  saveLegacySettings,
  stampActivity,
  submitGuess,
  updateInheritor,
  upsertDirectoryEntry,
} from './legacy-store'
import type { User } from 'firebase/auth'

const { state, FakeTimestamp, ST } = fake
const owner = { uid: 'o', email: 'owner@example.com', emailVerified: true, displayName: 'Lola' } as User
const opsOn = (path: string) => state.ops.filter(o => o.path === path)

beforeEach(() => {
  state.docs.clear()
  state.ops.length = 0
  state.denyRead.clear()
  state.denyWrite.clear()
  state.now = 1_000_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => state.now)
  state.docs.set('userDirectory/kid@example.com', { uid: 'i', displayName: 'Kid' })
})

describe('addInheritor', () => {
  it('deletes stale attempts, creates a pending link and stores the answer hash in one batch', async () => {
    state.docs.set('legacyAttempts/o_i', { count: 3 })
    const res = await addInheritor(owner, { email: ' Kid@Example.com ', questionId: 'q1', answer: ' Bantay ', shared: ['life', 'notes'] })
    expect(res).toEqual({ ok: true })
    expect(opsOn('legacyAttempts/o_i')).toEqual([{ op: 'delete', path: 'legacyAttempts/o_i', data: undefined }])
    expect(state.docs.has('legacyAttempts/o_i')).toBe(false)
    expect(state.docs.get('legacySecrets/o_i')).toEqual({ answerHash: await hashAnswer('o_i', 'Bantay') })
    const link = opsOn('legacyLinks/o_i')[0]
    expect(link.op).toBe('set')
    expect(Object.keys(link.data!).sort()).toEqual(
      ['createdAt', 'inheritorEmail', 'inheritorName', 'inheritorUid', 'ownerName', 'ownerUid', 'questionId', 'shared', 'status', 'updatedAt'],
    )
    expect(link.data).toMatchObject({
      ownerUid: 'o', inheritorUid: 'i', ownerName: 'Lola', inheritorName: 'Kid', inheritorEmail: 'kid@example.com',
      status: 'pending', questionId: 'q1', shared: ['life', 'notes'], createdAt: ST, updatedAt: ST,
    })
  })
  it('writes nothing for an unknown email, own email, sixth inheritor or bad answer', async () => {
    expect(await addInheritor(owner, { email: 'ghost@example.com', questionId: 'q1', answer: 'x', shared: [] })).toEqual({ ok: false, error: 'not-found' })
    expect(await addInheritor(owner, { email: 'owner@example.com', questionId: 'q1', answer: 'x', shared: [] })).toEqual({ ok: false, error: 'self' })
    expect(await addInheritor(owner, { email: 'kid@example.com', questionId: 'q1', answer: 'two words', shared: [] })).toEqual({ ok: false, error: 'answer' })
    for (const n of [1, 2, 3, 4, 5]) state.docs.set(`legacyLinks/o_x${n}`, { ownerUid: 'o', inheritorUid: `x${n}` })
    expect(await addInheritor(owner, { email: 'kid@example.com', questionId: 'q1', answer: 'x', shared: [] })).toEqual({ ok: false, error: 'limit' })
    expect(state.ops).toEqual([])
  })
  it('refuses to re-add someone who is already linked', async () => {
    state.docs.set('legacyLinks/o_i', { ownerUid: 'o', inheritorUid: 'i' })
    expect(await addInheritor(owner, { email: 'kid@example.com', questionId: 'q1', answer: 'x', shared: [] })).toEqual({ ok: false, error: 'exists' })
    expect(state.ops).toEqual([])
  })
})

describe('updateInheritor', () => {
  beforeEach(() => {
    state.docs.set('legacyLinks/o_i', { ownerUid: 'o', inheritorUid: 'i', questionId: 'q1', shared: ['life'] })
    state.docs.set('legacyAttempts/o_i', { count: 2 })
  })
  it('rejects a new question without a new answer and writes nothing', async () => {
    expect(await updateInheritor('o', 'i', { questionId: 'q2' })).toEqual({ ok: false, error: 'answer' })
    expect(state.ops).toEqual([])
  })
  it('a new answer rewrites the secret and deletes attempts in the same batch', async () => {
    expect(await updateInheritor('o', 'i', { questionId: 'q2', answer: 'Mingming' })).toEqual({ ok: true })
    expect(state.docs.get('legacySecrets/o_i')).toEqual({ answerHash: await hashAnswer('o_i', 'mingming') })
    expect(state.docs.has('legacyAttempts/o_i')).toBe(false)
    expect(opsOn('legacyLinks/o_i')[0]).toEqual({ op: 'update', path: 'legacyLinks/o_i', data: { questionId: 'q2', updatedAt: ST } })
  })
  it('changing only the shared kinds leaves secret and attempts alone', async () => {
    expect(await updateInheritor('o', 'i', { shared: ['goals', 'health'] })).toEqual({ ok: true })
    expect(state.ops).toEqual([{ op: 'update', path: 'legacyLinks/o_i', data: { shared: ['goals', 'health'], updatedAt: ST } }])
  })
})

describe('removeInheritor', () => {
  it('deletes link, secret and attempts in one batch', async () => {
    await removeInheritor('o', 'i')
    expect(state.ops.map(o => `${o.op} ${o.path}`).sort()).toEqual(
      ['delete legacyAttempts/o_i', 'delete legacyLinks/o_i', 'delete legacySecrets/o_i'],
    )
  })
})

describe('submitGuess', () => {
  const ownerProfile = 'users/o/legacy/profile'
  it('creates the attempt with count 1 when none exists', async () => {
    state.denyRead.add(ownerProfile)
    const res = await submitGuess('o', 'i', 'Wrong')
    expect(opsOn('legacyAttempts/o_i')[0].data).toEqual({ count: 1, windowStart: ST, guessHash: await hashAnswer('o_i', 'wrong'), lastAt: ST })
    expect(Object.keys(opsOn('legacyAttempts/o_i')[0].data!)).not.toContain('correct')
    expect(res).toEqual({ correct: false, triesLeft: MAX_TRIES - 1, lockedUntil: null })
  })
  it('counts up within the window and keeps windowStart', async () => {
    const start = new FakeTimestamp(state.now - 1000)
    state.docs.set('legacyAttempts/o_i', { count: 2, windowStart: start, guessHash: 'x', lastAt: start })
    state.denyRead.add(ownerProfile)
    const res = await submitGuess('o', 'i', 'Wrong')
    expect(opsOn('legacyAttempts/o_i')[0].data).toMatchObject({ count: 3, windowStart: start })
    expect(res.triesLeft).toBe(2)
  })
  it('starts over after 24 hours', async () => {
    const start = new FakeTimestamp(state.now - TRY_WINDOW_MS - 1)
    state.docs.set('legacyAttempts/o_i', { count: 5, windowStart: start, guessHash: 'x', lastAt: start })
    state.denyRead.add(ownerProfile)
    await submitGuess('o', 'i', 'Wrong')
    expect(opsOn('legacyAttempts/o_i')[0].data).toMatchObject({ count: 1, windowStart: ST })
  })
  it('reports correct when the profile becomes readable', async () => {
    state.docs.set(ownerProfile, { preferredName: 'Lola' })
    expect(await submitGuess('o', 'i', 'Bantay')).toEqual({ correct: true, triesLeft: MAX_TRIES - 1, lockedUntil: null })
  })
  it('reports the lock time on the fifth wrong guess', async () => {
    const start = new FakeTimestamp(state.now - 1000)
    state.docs.set('legacyAttempts/o_i', { count: 4, windowStart: start, guessHash: 'x', lastAt: start })
    state.denyRead.add(ownerProfile)
    expect(await submitGuess('o', 'i', 'Wrong')).toEqual({ correct: false, triesLeft: 0, lockedUntil: start.ms + TRY_WINDOW_MS })
  })
  it('treats a denied write as locked', async () => {
    const start = new FakeTimestamp(state.now - 1000)
    state.docs.set('legacyAttempts/o_i', { count: 4, windowStart: start, guessHash: 'x', lastAt: start })
    state.denyWrite.add('legacyAttempts/o_i')
    expect(await submitGuess('o', 'i', 'Wrong')).toEqual({ correct: false, triesLeft: 0, lockedUntil: start.ms + TRY_WINDOW_MS })
  })
})

describe('isReleased', () => {
  it('is true when the beacon is readable and false when denied', async () => {
    state.docs.set('users/o/legacy/beacon', { ownerName: 'Lola' })
    expect(await isReleased('o')).toBe(true)
    state.denyRead.add('users/o/legacy/beacon')
    expect(await isReleased('o')).toBe(false)
  })
})

describe('saveLegacySettings', () => {
  it('creates settings with all stamps and also writes beacon and profile', async () => {
    state.docs.set('users/o', { displayName: 'Lola D', preferredName: 'Lola', importantPeople: ['Kid'], tone: 'warm', language: 'tl', email: 'secret' })
    await saveLegacySettings('o', { enabled: true, releaseAfterMinutes: 43200 })
    expect(opsOn('users/o/legacy/settings')[0].data).toEqual({
      enabled: true, releaseAfterMinutes: 43200, lastActiveAt: ST, createdAt: ST, updatedAt: ST,
    })
    expect(opsOn('users/o/legacy/beacon')[0].data).toEqual({ ownerName: 'Lola', updatedAt: ST })
    expect(opsOn('users/o/legacy/profile')[0].data).toEqual({
      displayName: 'Lola D', preferredName: 'Lola', importantPeople: ['Kid'], tone: 'warm', language: 'tl', updatedAt: ST,
    })
  })
  it('updates existing settings without touching createdAt', async () => {
    state.docs.set('users/o', { displayName: null, preferredName: 'Lola', importantPeople: [], tone: 'warm' })
    state.docs.set('users/o/legacy/settings', { enabled: true, releaseAfterMinutes: 5, createdAt: 1 })
    await saveLegacySettings('o', { enabled: false, releaseAfterMinutes: 5 })
    expect(opsOn('users/o/legacy/settings')[0]).toEqual({
      op: 'update', path: 'users/o/legacy/settings',
      data: { enabled: false, releaseAfterMinutes: 5, lastActiveAt: ST, updatedAt: ST },
    })
  })
  it('rejects minutes outside 5 … 1,051,200', async () => {
    await expect(saveLegacySettings('o', { enabled: true, releaseAfterMinutes: 4 })).rejects.toThrow()
    await expect(saveLegacySettings('o', { enabled: true, releaseAfterMinutes: 1_051_201 })).rejects.toThrow()
  })
})

describe('stampActivity', () => {
  it('stamps lastActiveAt at most once per hour', async () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) })
    state.docs.set('users/o/legacy/settings', { enabled: true })
    await stampActivity('o')
    await stampActivity('o')
    expect(opsOn('users/o/legacy/settings')).toEqual([
      { op: 'update', path: 'users/o/legacy/settings', data: { lastActiveAt: ST, updatedAt: ST } },
    ])
    state.now += 3_600_000
    await stampActivity('o')
    expect(opsOn('users/o/legacy/settings')).toHaveLength(2)
    vi.unstubAllGlobals()
  })
  it('does nothing when there are no settings and survives broken storage', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    await expect(stampActivity('o')).resolves.toBeUndefined()
    expect(state.ops).toEqual([])
    vi.unstubAllGlobals()
  })
})

describe('upsertDirectoryEntry', () => {
  it('writes a lowercased entry only for a verified email', async () => {
    await upsertDirectoryEntry({ uid: 'u', email: 'New@Example.com', emailVerified: false, displayName: 'N' } as User)
    expect(state.ops).toEqual([])
    await upsertDirectoryEntry({ uid: 'u', email: 'New@Example.com', emailVerified: true, displayName: 'N' } as User)
    expect(state.ops).toEqual([{ op: 'set', path: 'userDirectory/new@example.com', data: { uid: 'u', displayName: 'N' } }])
  })
})
