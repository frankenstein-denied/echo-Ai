import { describe, expect, it } from 'vitest'
import { orbBakeBox, orbBakeKey, orbSwatchStyle } from '@/components/echo/memory-orb'
import { ORB_COLOR, orbShares, PEARL, type OrbKind } from './orbs'

const zero: Record<OrbKind, number> = { note: 0, goal: 0, reminder: 0, health: 0, person: 0, interest: 0 }

describe('orbSwatchStyle', () => {
  it('is a pearl when nothing was saved', () => {
    const s = orbSwatchStyle(zero)
    expect(s.backgroundColor).toBe(PEARL)
    expect(String(s.boxShadow)).toContain(PEARL)
    expect(s.borderRadius).toBe('50%')
    for (const c of Object.values(ORB_COLOR)) expect(String(s.backgroundImage)).not.toContain(c)
  })

  it('includes every orbShares color, with the dominant one as base and glow', () => {
    const counts = { ...zero, note: 3, health: 2, person: 2, interest: 1, goal: 1 }
    const s = orbSwatchStyle(counts)
    const shares = orbShares(counts)
    const dominant = ORB_COLOR[shares[0].kind]
    expect(s.backgroundColor).toBe(dominant)
    expect(String(s.boxShadow)).toContain(dominant)
    for (const { kind } of shares.slice(1)) expect(String(s.backgroundImage)).toContain(ORB_COLOR[kind])
    expect(String(s.backgroundImage)).toContain('rgba(255,255,255')
  })

  it('is deterministic', () => {
    const counts = { ...zero, goal: 2, person: 1 }
    expect(orbSwatchStyle(counts)).toEqual(orbSwatchStyle({ ...counts }))
  })
})

describe('lite orb bake', () => {
  it('covers the halo and stays within the pixel budget', () => {
    const small = orbBakeBox(16, 1)
    expect(small.half).toBeGreaterThanOrEqual(16 * 2)
    expect(small.scale).toBe(1.5)
    const big = orbBakeBox(60, 3)
    expect(big.half * 2 * big.scale).toBeLessThanOrEqual(320)
    expect(big.scale).toBeGreaterThanOrEqual(1)
    expect(orbBakeBox(20, 3).scale).toBe(3)
  })
  it('keys on everything that changes the picture', () => {
    const orb = { id: 'orb-a', radius: 24, counts: { ...zero, note: 2, goal: 1 } }
    const k = orbBakeKey(orb, 1.5)
    expect(orbBakeKey({ ...orb }, 1.5)).toBe(k)
    expect(orbBakeKey({ ...orb, id: 'orb-b' }, 1.5)).not.toBe(k)
    expect(orbBakeKey({ ...orb, radius: 25 }, 1.5)).not.toBe(k)
    expect(orbBakeKey({ ...orb, counts: { ...orb.counts, goal: 2 } }, 1.5)).not.toBe(k)
    expect(orbBakeKey(orb, 3)).not.toBe(k)
  })
})
