import { describe, expect, it } from 'vitest'
import { orbSwatchStyle } from '@/components/echo/memory-orb'
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
