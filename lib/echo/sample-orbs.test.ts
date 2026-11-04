import { describe, expect, it } from 'vitest'
import { ORB_KINDS } from './orbs'
import { SAMPLE_ORBS, SAMPLE_THREADS } from './sample-orbs'

describe('sample orbs', () => {
  it('has 5 orbs with unique ids', () => {
    expect(SAMPLE_ORBS).toHaveLength(5)
    expect(new Set(SAMPLE_ORBS.map((o) => o.id)).size).toBe(5)
  })
  it('joins only orbs that exist', () => {
    const ids = new Set(SAMPLE_ORBS.map((o) => o.id))
    expect(SAMPLE_THREADS).toHaveLength(4)
    for (const t of SAMPLE_THREADS) {
      expect(ids.has(t.source)).toBe(true)
      expect(ids.has(t.target)).toBe(true)
    }
  })
  it('gives every orb at least one color', () => {
    for (const o of SAMPLE_ORBS) expect(ORB_KINDS.some((k) => o.counts[k] > 0)).toBe(true)
  })
})
