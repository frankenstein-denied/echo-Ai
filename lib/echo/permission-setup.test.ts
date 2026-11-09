import { describe, expect, it } from 'vitest'
import type { NativePermissions } from '@/lib/native/echo-bridge'
import { nextStep, shouldShowSetup, STEP_COPY, stepStatus } from './permission-setup'

const denied: NativePermissions = {
  notifications: false,
  microphone: false,
  location: false,
  overlay: false,
  canAskMicrophone: true,
  canAskLocation: true,
  canAskNotifications: true,
}
const granted: NativePermissions = { ...denied, notifications: true, microphone: true, location: true, overlay: true }

describe('nextStep', () => {
  it('starts with notifications when nothing is allowed', () => {
    expect(nextStep(denied, [])).toBe('notifications')
  })

  it('moves to the microphone once notifications are allowed', () => {
    expect(nextStep({ ...denied, notifications: true }, [])).toBe('microphone')
  })

  it('passes over a skipped step', () => {
    expect(nextStep({ ...denied, notifications: true }, ['microphone'])).toBe('location')
  })

  it('reaches the overlay last', () => {
    expect(nextStep({ ...denied, notifications: true, microphone: true, location: true }, [])).toBe('overlay')
  })

  it('is done when everything is allowed', () => {
    expect(nextStep(granted, [])).toBe('done')
  })

  it('is done when the rest are skipped', () => {
    expect(nextStep(denied, ['notifications', 'microphone', 'location', 'overlay'])).toBe('done')
  })
})

describe('stepStatus', () => {
  it('is granted when allowed', () => {
    expect(stepStatus('microphone', granted)).toBe('granted')
  })

  it('asks while Android still shows its pop-up', () => {
    expect(stepStatus('microphone', denied)).toBe('ask')
  })

  it('is blocked when the microphone is denied and Android will not ask again', () => {
    expect(stepStatus('microphone', { ...denied, canAskMicrophone: false })).toBe('blocked')
  })

  it('is blocked for location and notifications the same way', () => {
    expect(stepStatus('location', { ...denied, canAskLocation: false })).toBe('blocked')
    expect(stepStatus('notifications', { ...denied, canAskNotifications: false })).toBe('blocked')
  })

  it('never blocks the overlay, which always opens settings', () => {
    expect(stepStatus('overlay', denied)).toBe('ask')
  })
})

describe('shouldShowSetup', () => {
  const base = { isNative: true, embed: false, onboarded: true, done: false, perms: denied }

  it('shows on a phone with something still to allow', () => {
    expect(shouldShowSetup(base)).toBe(true)
  })

  it('hides on the web', () => {
    expect(shouldShowSetup({ ...base, isNative: false })).toBe(false)
  })

  it('hides in floating Echo', () => {
    expect(shouldShowSetup({ ...base, embed: true })).toBe(false)
  })

  it('waits for onboarding', () => {
    expect(shouldShowSetup({ ...base, onboarded: false })).toBe(false)
  })

  it('hides once done', () => {
    expect(shouldShowSetup({ ...base, done: true })).toBe(false)
  })

  it('hides on an older APK that reports no permissions', () => {
    expect(shouldShowSetup({ ...base, perms: null })).toBe(false)
  })

  it('hides when everything is allowed', () => {
    expect(shouldShowSetup({ ...base, perms: granted })).toBe(false)
  })

  it('shows when only one is missing', () => {
    expect(shouldShowSetup({ ...base, perms: { ...granted, overlay: false } })).toBe(true)
  })
})

describe('STEP_COPY', () => {
  it('has the agreed words', () => {
    expect(STEP_COPY.notifications).toEqual({ title: 'Notifications', why: 'So Echo can check in on you and show your reminders, even when the app is closed.' })
    expect(STEP_COPY.microphone).toEqual({ title: 'Microphone', why: 'So you can talk to Echo and make voice calls.' })
    expect(STEP_COPY.location).toEqual({ title: 'Location', why: 'So Echo knows your local weather. Only your rough area is used.' })
    expect(STEP_COPY.overlay).toEqual({
      title: 'Show Echo over other apps',
      why: "So Echo's chathead can pop up with a quick check-in. Android opens a settings page: turn on Echo, then come back.",
    })
  })
})
