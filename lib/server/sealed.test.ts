import { describe, expect, it } from 'vitest'
import { open, seal, validSecret } from './sealed'

const SECRET = Buffer.alloc(32, 7).toString('base64')
const OTHER = Buffer.alloc(32, 9).toString('base64')

describe('seal / open', () => {
  it('round trips JSON for the same uid', () => {
    const value = { access: 'a', refresh: 'r', expiresAt: 123 }
    const sealed = seal(value, 'uid-1', SECRET)
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(sealed).not.toContain('refresh')
    expect(open(sealed, 'uid-1', SECRET)).toEqual(value)
  })

  it('uses a fresh IV each time', () => {
    expect(seal('x', 'u', SECRET)).not.toBe(seal('x', 'u', SECRET))
  })

  it('returns null for another uid', () => {
    expect(open(seal({ a: 1 }, 'uid-1', SECRET), 'uid-2', SECRET)).toBeNull()
  })

  it('returns null when a byte is flipped', () => {
    const sealed = seal({ a: 1 }, 'uid-1', SECRET)
    const [v, iv, body] = sealed.split('.')
    const bytes = Buffer.from(body, 'base64url')
    bytes[0] ^= 1
    expect(open(`${v}.${iv}.${bytes.toString('base64url')}`, 'uid-1', SECRET)).toBeNull()
  })

  it('returns null for a bad version, junk, a wrong secret or no secret', () => {
    const sealed = seal({ a: 1 }, 'uid-1', SECRET)
    expect(open(sealed.replace(/^v1/, 'v2'), 'uid-1', SECRET)).toBeNull()
    expect(open('not-sealed', 'uid-1', SECRET)).toBeNull()
    expect(open(sealed, 'uid-1', OTHER)).toBeNull()
    expect(open(sealed, 'uid-1', '')).toBeNull()
  })

  it('seal throws without a secret', () => {
    expect(() => seal({ a: 1 }, 'uid-1', '')).toThrow(/CONNECTOR_SECRET/)
  })

  it('requires CONNECTOR_SECRET to be base64 of exactly 32 bytes', () => {
    expect(validSecret(SECRET)).toBe(true)
    const sealed = seal({ a: 1 }, 'uid-1', SECRET)
    for (const bad of [Buffer.alloc(16, 1).toString('base64'), Buffer.alloc(33, 1).toString('base64'), 'not base64 at all!', 'test-secret-0123456789abcdef0123456789abcdef']) {
      expect(validSecret(bad)).toBe(false)
      expect(() => seal({ a: 1 }, 'uid-1', bad)).toThrow(/CONNECTOR_SECRET/)
      expect(open(sealed, 'uid-1', bad)).toBeNull()
    }
  })
})
