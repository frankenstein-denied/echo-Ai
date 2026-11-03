import { describe, expect, it, vi } from 'vitest'
import { fetchForecast, formatWeather, roundCoord, searchPlaces, weatherCodeText, type ForecastData } from './weather'

const jsonRes = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response

const hours = (date: string) => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`)

const FORECAST: ForecastData = {
  current: { time: '2026-11-03T13:30', temperature_2m: 31.2, apparent_temperature: 35.6, weather_code: 2, wind_speed_10m: 12.4, precipitation: 0 },
  hourly: {
    time: [...hours('2026-11-03'), ...hours('2026-11-04')],
    temperature_2m: [...Array.from({ length: 24 }, (_, h) => (h === 14 ? 32.4 : 27)), ...Array(24).fill(40)],
    precipitation_probability: [...Array.from({ length: 24 }, (_, h) => (h === 15 ? 70 : h === 5 ? 95 : 10)), ...Array(24).fill(99)],
  },
  daily: {
    time: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
    weather_code: [2, 63, 2, 95],
    temperature_2m_max: [32.4, 32, 31, 30],
    temperature_2m_min: [26, 26, 25, 25],
    precipitation_probability_max: [70, 80, 20, 60],
  },
}

describe('roundCoord', () => {
  it('rounds to 2 decimals', () => {
    expect(roundCoord(14.59951)).toBe(14.6)
    expect(roundCoord(120.98421)).toBe(120.98)
    expect(roundCoord(-33.8651)).toBeCloseTo(-33.87, 2)
  })
})

describe('weatherCodeText', () => {
  it('maps WMO codes', () => {
    expect(weatherCodeText(0)).toBe('clear')
    expect(weatherCodeText(2)).toBe('partly cloudy')
    expect(weatherCodeText(45)).toBe('fog')
    expect(weatherCodeText(53)).toBe('drizzle')
    expect(weatherCodeText(63)).toBe('rain')
    expect(weatherCodeText(65)).toBe('heavy rain')
    expect(weatherCodeText(73)).toBe('snow')
    expect(weatherCodeText(95)).toBe('thunderstorm')
  })
  it('falls back to mixed', () => {
    expect(weatherCodeText(1234)).toBe('mixed')
  })
})

describe('searchPlaces', () => {
  it('maps results and rounds coords', async () => {
    const f = vi.fn(async (_url: string) =>
      jsonRes({ results: [
        { name: 'Manila', latitude: 14.6042, longitude: 120.9822, admin1: 'Metro Manila', country: 'Philippines' },
        { name: 'Nowhere', latitude: 1.234, longitude: 2.345 },
      ] }),
    )
    const out = await searchPlaces('Manila', f as unknown as typeof fetch)
    expect(out).toEqual([
      { name: 'Manila', detail: 'Metro Manila, Philippines', lat: 14.6, lon: 120.98 },
      { name: 'Nowhere', detail: '', lat: 1.23, lon: 2.35 },
    ])
    const url = String(f.mock.calls[0][0])
    expect(url).toContain('https://geocoding-api.open-meteo.com/v1/search')
    expect(url).toContain('name=Manila')
    expect(url).toContain('count=5')
    expect(url).toContain('language=en')
    expect(url).toContain('format=json')
  })
  it('returns [] for empty name without fetching, and when no results key', async () => {
    const f = vi.fn(async (_url: string) => jsonRes({}))
    expect(await searchPlaces('   ', f as unknown as typeof fetch)).toEqual([])
    expect(f).not.toHaveBeenCalled()
    expect(await searchPlaces('zzzz', f as unknown as typeof fetch)).toEqual([])
  })
  it('throws on failure', async () => {
    const f = vi.fn(async (_url: string) => jsonRes({}, false, 500))
    await expect(searchPlaces('x', f as unknown as typeof fetch)).rejects.toThrow()
  })
})

describe('fetchForecast', () => {
  it('requests the right params and returns data', async () => {
    const f = vi.fn(async (_url: string) => jsonRes(FORECAST))
    const data = await fetchForecast(14.6, 120.98, f as unknown as typeof fetch)
    expect(data.daily.time).toHaveLength(4)
    const url = new URL(String(f.mock.calls[0][0]))
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(url.searchParams.get('latitude')).toBe('14.6')
    expect(url.searchParams.get('longitude')).toBe('120.98')
    expect(url.searchParams.get('current')).toBe('temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation')
    expect(url.searchParams.get('hourly')).toBe('precipitation_probability,temperature_2m')
    expect(url.searchParams.get('daily')).toBe('weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max')
    expect(url.searchParams.get('timezone')).toBe('auto')
    expect(url.searchParams.get('forecast_days')).toBe('4')
  })
  it('aborts after the timeout', async () => {
    const hang = ((_u: string, init?: RequestInit) =>
      new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch
    await expect(fetchForecast(1, 2, hang, 20)).rejects.toThrow()
  })
  it('throws on non-OK', async () => {
    const f = vi.fn(async (_url: string) => jsonRes({}, false, 503))
    await expect(fetchForecast(1, 2, f as unknown as typeof fetch)).rejects.toThrow()
  })
  it('throws on malformed response', async () => {
    const f = vi.fn(async (_url: string) => jsonRes({ current: {} }))
    await expect(fetchForecast(1, 2, f as unknown as typeof fetch)).rejects.toThrow()
  })
})

describe('formatWeather', () => {
  it('formats the block', () => {
    const text = formatWeather('Manila, Philippines', FORECAST)
    expect(text.split('\n')).toEqual([
      'Place: Manila, Philippines',
      'Now: 31°C (feels 36°C), partly cloudy, wind 12 km/h',
      'Rest of today: up to 32°C; rain chance up to 70% (highest around 15:00)',
      'Wed: 26–32°C, rain, 80% chance',
      'Thu: 25–31°C, partly cloudy, 20% chance',
      'Fri: 25–30°C, thunderstorm, 60% chance',
    ])
  })
  it('caps at 600 characters', () => {
    const text = formatWeather('P'.repeat(2000), FORECAST)
    expect(text.length).toBeLessThanOrEqual(600)
  })
})
