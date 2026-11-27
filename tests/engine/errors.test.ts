// Echo Legacy engine — typed errors.
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { describe, expect, it } from 'vitest'
import {
  AccessDenied,
  AmbiguousName,
  EchoLegacyError,
  PolicyFrozen,
  PolicySyntaxError,
  TamperDetected,
} from '@/engine/src/errors'

describe('typed errors', () => {
  const all = [
    new AccessDenied('Nothing to share.'),
    new AmbiguousName('Two people match "maria".'),
    new PolicyFrozen('The policy is frozen.'),
    new PolicySyntaxError('Unknown character "@"', 3, 7),
    new TamperDetected('broken link', 4),
  ]

  it('are EchoLegacyErrors and Errors, named after their class', () => {
    for (const e of all) {
      expect(e).toBeInstanceOf(EchoLegacyError)
      expect(e).toBeInstanceOf(Error)
      expect(e.name).toBe(e.constructor.name)
    }
  })

  it('PolicySyntaxError carries line and column in its message', () => {
    const e = new PolicySyntaxError('Unknown character "@"', 3, 7)
    expect(e.message).toBe('Unknown character "@" (line 3, column 7)')
    expect(e.line).toBe(3)
    expect(e.column).toBe(7)
  })

  it('TamperDetected carries the index of the first broken link', () => {
    expect(new TamperDetected('x', 4).index).toBe(4)
  })
})
