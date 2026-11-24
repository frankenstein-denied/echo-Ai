import { describe, expect, it } from 'vitest'
import { DICTATION_MESSAGES, heardSomething, micErrorMessage, MIN_DICTATION_SAMPLES } from './dictation'

describe('dictation', () => {
  it('a denied or missing mic gives a short message (the text box keeps working)', () => {
    expect(micErrorMessage(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe(DICTATION_MESSAGES.denied)
    expect(micErrorMessage({ name: 'SecurityError' })).toBe(DICTATION_MESSAGES.denied)
    expect(micErrorMessage({ name: 'NotFoundError' })).toBe(DICTATION_MESSAGES.noMic)
    expect(micErrorMessage({ name: 'NotReadableError' })).toBe(DICTATION_MESSAGES.busy)
    expect(micErrorMessage(new Error('weird'))).toBe(DICTATION_MESSAGES.failed)
    expect(micErrorMessage(undefined)).toBe(DICTATION_MESSAGES.failed)
    for (const m of Object.values(DICTATION_MESSAGES)) expect(m.length).toBeLessThan(80)
  })

  it('no audio (too short or silent) is not sent', () => {
    expect(heardSomething(0, 0)).toBe(false)
    expect(heardSomething(MIN_DICTATION_SAMPLES - 1, 0.5)).toBe(false)
    expect(heardSomething(MIN_DICTATION_SAMPLES * 4, 0.001)).toBe(false)
    expect(heardSomething(MIN_DICTATION_SAMPLES * 4, 0.2)).toBe(true)
  })
})
