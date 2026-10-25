import { describe, expect, it } from 'vitest'
import { badgeClass, buttonClass } from './ui-classes'

describe('ui-classes', () => {
  it('maps badge variants to soft tints', () => {
    expect(badgeClass('success')).toContain('bg-success-soft')
    expect(badgeClass()).toContain('text-muted-foreground')
  })
  it('node type overrides variant', () => {
    expect(badgeClass('danger', 'person')).toContain('text-node-person')
    expect(badgeClass('danger', 'person')).not.toContain('danger')
  })
  it('builds button classes with focus ring', () => {
    const c = buttonClass('danger', 'sm', 'w-full')
    expect(c).toContain('bg-danger')
    expect(c).toContain('text-background')
    expect(c).not.toContain('text-white')
    expect(c).toContain('h-8')
    expect(c).toContain('ring-primary')
    expect(c.endsWith('w-full')).toBe(true)
  })
})
