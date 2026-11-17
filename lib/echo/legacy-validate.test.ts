import { describe, expect, it } from 'vitest'
import { validateNewInheritor } from './legacy-validate'

const base = {
  ownerUid: 'o',
  ownerEmail: 'owner@example.com',
  email: 'kid@example.com',
  questionId: 'q1',
  answer: 'Bantay',
  existingCount: 0,
  found: { uid: 'i', displayName: 'Kid' },
}

describe('validateNewInheritor', () => {
  it('accepts a valid inheritor', () => {
    expect(validateNewInheritor(base)).toEqual({ ok: true })
  })
  it('rejects adding yourself by uid', () => {
    expect(validateNewInheritor({ ...base, found: { uid: 'o', displayName: 'Me' } })).toEqual({ ok: false, error: 'self' })
  })
  it('rejects your own email, any case or spacing', () => {
    expect(validateNewInheritor({ ...base, email: '  Owner@Example.COM ' })).toEqual({ ok: false, error: 'self' })
  })
  it('rejects an email with no directory entry', () => {
    expect(validateNewInheritor({ ...base, found: null })).toEqual({ ok: false, error: 'not-found' })
  })
  it('rejects a sixth inheritor', () => {
    expect(validateNewInheritor({ ...base, existingCount: 5 })).toEqual({ ok: false, error: 'limit' })
    expect(validateNewInheritor({ ...base, existingCount: 4 })).toEqual({ ok: true })
  })
  it('rejects an unknown question id', () => {
    expect(validateNewInheritor({ ...base, questionId: 'q99' })).toEqual({ ok: false, error: 'question' })
  })
  it('rejects an answer of two words', () => {
    expect(validateNewInheritor({ ...base, answer: 'two words' })).toEqual({ ok: false, error: 'answer' })
  })
  it('accepts an answer with surrounding spaces', () => {
    expect(validateNewInheritor({ ...base, answer: '  Bantay ' })).toEqual({ ok: true })
  })
  it('rejects a malformed email', () => {
    expect(validateNewInheritor({ ...base, email: 'nope' })).toEqual({ ok: false, error: 'email' })
  })
})
