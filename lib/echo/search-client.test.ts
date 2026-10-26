import { vi } from 'vitest'
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
import { describe, expect, it } from 'vitest'
import { searchWebViaApi } from './client'
import { SEARCH_NOT_CONNECTED_REPLY, SEARCH_QUOTA_REPLY, SEARCH_RECONNECT_REPLY } from './search-replies'

const user = { getIdToken: async () => 'tok' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('searchWebViaApi', () => {
  it('without a sealed key answers not_connected and never fetches', async () => {
    const f = vi.fn()
    const r = await searchWebViaApi(user, 'x', undefined, f as never)
    expect(r.output).toEqual({ error: 'not_connected', tell_user: SEARCH_NOT_CONNECTED_REPLY })
    expect(f).not.toHaveBeenCalled()
  })
  it('returns results with citing rules and passes resealed along', async () => {
    const f = vi.fn(async () => json({ results: [{ title: 'A', url: 'https://a', content: 'c' }], resealed: 's2' }))
    const r = await searchWebViaApi(user, 'x', 'sealed', f as never)
    expect(r.resealed).toBe('s2')
    expect(r.output).toMatchObject({ results: [{ title: 'A', url: 'https://a', content: 'c' }] })
    expect(String(r.output.instructions)).toMatch(/site name/)
    expect(String(r.output.instructions)).toMatch(/never change/i)
  })
  it('maps errors to tell_user and flags a disconnect on reconnect', async () => {
    const rc = await searchWebViaApi(user, 'x', 's', (async () => json({ error: 'reconnect' })) as never)
    expect(rc).toMatchObject({ output: { error: 'reconnect', tell_user: SEARCH_RECONNECT_REPLY }, disconnect: true })
    const q = await searchWebViaApi(user, 'x', 's', (async () => json({ error: 'quota', resealed: 'r' }, 429)) as never)
    expect(q).toMatchObject({ output: { error: 'quota', tell_user: SEARCH_QUOTA_REPLY }, resealed: 'r' })
    const bad = await searchWebViaApi(user, 'x', 's', (async () => {
      throw new Error('net')
    }) as never)
    expect(bad.output).toMatchObject({ error: 'failed' })
  })
})
