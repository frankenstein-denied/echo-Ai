import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
import { AUTO_PLACE, autoSyncDue, syncWeatherLocation, weatherAction } from './weather-location'

const HOUR = 3600000

describe('weatherAction', () => {
  const pos = { lat: 14.6012, lon: 121.0004 }

  it('connects when weather was never set up', () => {
    expect(weatherAction(null, pos)).toBe('connect')
  })
  it('leaves weather alone when it was turned off', () => {
    expect(weatherAction({ connected: false }, pos)).toBe('none')
  })
  it('leaves a city chosen by hand alone', () => {
    expect(weatherAction({ connected: true, place: 'Manila, Metro Manila', lat: 14.6, lon: 121.0 }, { lat: 10, lon: 120 })).toBe('none')
  })
  it('does nothing when the rounded spot is the same', () => {
    expect(weatherAction({ connected: true, place: AUTO_PLACE, lat: 14.6, lon: 121.0 }, pos)).toBe('none')
  })
  it('updates when the phone has moved', () => {
    expect(weatherAction({ connected: true, place: 'Your location', lat: 14.6, lon: 121.0 }, { lat: 14.7, lon: 121.0 })).toBe('update')
  })
  it('updates a location doc missing its coordinates', () => {
    expect(weatherAction({ connected: true, place: AUTO_PLACE }, pos)).toBe('update')
  })
})

describe('autoSyncDue', () => {
  const now = 1_000 * HOUR
  it('is due when it never ran', () => {
    expect(autoSyncDue(now, null)).toBe(true)
  })
  it('waits 6 hours between runs', () => {
    expect(autoSyncDue(now, now - 5 * HOUR)).toBe(false)
    expect(autoSyncDue(now, now - 6 * HOUR)).toBe(true)
  })
  it('is due when the saved time is in the future (clock changed)', () => {
    expect(autoSyncDue(now, now + HOUR)).toBe(true)
  })
})

describe('syncWeatherLocation', () => {
  it('resolves without saving when the position fails', async () => {
    const save = vi.fn(async () => {})
    await expect(syncWeatherLocation('u1', { getDoc: async () => null, getPosition: async () => Promise.reject(new Error('denied')), save })).resolves.toBeUndefined()
    expect(save).not.toHaveBeenCalled()
  })
  it('resolves without saving when the doc read fails', async () => {
    const save = vi.fn(async () => {})
    const getPosition = vi.fn(async () => ({ lat: 14.6, lon: 121 }))
    await syncWeatherLocation('u1', { getDoc: async () => Promise.reject(new Error('offline')), getPosition, save })
    expect(save).not.toHaveBeenCalled()
  })
  it('does not ask for the position when weather was turned off or set to a city', async () => {
    const getPosition = vi.fn(async () => ({ lat: 14.6, lon: 121 }))
    const save = vi.fn(async () => {})
    await syncWeatherLocation('u1', { getDoc: async () => ({ connected: false }), getPosition, save })
    await syncWeatherLocation('u1', { getDoc: async () => ({ connected: true, place: 'Cebu City', lat: 10.3, lon: 123.9 }), getPosition, save })
    expect(getPosition).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
  it('saves the phone location on connect', async () => {
    const save = vi.fn(async () => {})
    await syncWeatherLocation('u1', { getDoc: async () => null, getPosition: async () => ({ lat: 14.6012, lon: 121.0004 }), save })
    expect(save).toHaveBeenCalledWith('u1', { place: AUTO_PLACE, lat: 14.6012, lon: 121.0004 })
  })
  it('saves on update and skips when nothing changed', async () => {
    const save = vi.fn(async () => {})
    const getDoc = async () => ({ connected: true, place: AUTO_PLACE, lat: 14.6, lon: 121 })
    await syncWeatherLocation('u1', { getDoc, getPosition: async () => ({ lat: 14.6012, lon: 121.0004 }), save })
    expect(save).not.toHaveBeenCalled()
    await syncWeatherLocation('u1', { getDoc, getPosition: async () => ({ lat: 14.7, lon: 121 }), save })
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('never throws when saving fails', async () => {
    const save = vi.fn(async () => Promise.reject(new Error('rules')))
    await expect(syncWeatherLocation('u1', { getDoc: async () => null, getPosition: async () => ({ lat: 1, lon: 2 }), save })).resolves.toBeUndefined()
  })
})

describe('syncWeatherLocation overlap', () => {
  it('shares one run when called twice at once', async () => {
    const getPosition = vi.fn(async () => ({ lat: 14.6, lon: 121 }))
    const save = vi.fn(async () => {})
    await Promise.all([syncWeatherLocation('u1', { getDoc: async () => null, getPosition, save }), syncWeatherLocation('u1', { getDoc: async () => null, getPosition, save })])
    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('fromSetup (location just allowed on the welcome step)', () => {
  const pos = { lat: 14.6, lon: 121 }
  it('connects a weather connector that is off with no place', () => {
    expect(weatherAction({ connected: false }, pos, { fromSetup: true })).toBe('connect')
  })
  it('the automatic sync never connects it', () => {
    expect(weatherAction({ connected: false }, pos)).toBe('none')
    expect(weatherAction({ connected: false }, pos, {})).toBe('none')
  })
  it('leaves a city chosen by hand alone', () => {
    expect(weatherAction({ connected: true, place: 'Cebu City', lat: 10.3, lon: 123.9 }, pos, { fromSetup: true })).toBe('none')
  })
  it('treats a connected phone location as before', () => {
    expect(weatherAction({ connected: true, place: AUTO_PLACE, lat: 14.6, lon: 121 }, pos, { fromSetup: true })).toBe('none')
    expect(weatherAction({ connected: true, place: AUTO_PLACE, lat: 14.6, lon: 121 }, { lat: 14.7, lon: 121 }, { fromSetup: true })).toBe('update')
  })
  it('syncWeatherLocation saves for the welcome step but not for the automatic sync', async () => {
    const getPosition = vi.fn(async () => pos)
    const save = vi.fn(async () => {})
    const deps = { getDoc: async () => ({ connected: false }), getPosition, save }
    await syncWeatherLocation('u1', deps)
    expect(getPosition).not.toHaveBeenCalled()
    await syncWeatherLocation('u1', deps, { fromSetup: true })
    expect(save).toHaveBeenCalledWith('u1', { place: AUTO_PLACE, lat: 14.6, lon: 121 })
  })
  it('runs after an automatic sync already going instead of joining it', async () => {
    const save = vi.fn(async () => {})
    const deps = { getDoc: async () => ({ connected: false }), getPosition: async () => pos, save }
    await Promise.all([syncWeatherLocation('u1', deps), syncWeatherLocation('u1', deps, { fromSetup: true })])
    expect(save).toHaveBeenCalledTimes(1)
  })
})
