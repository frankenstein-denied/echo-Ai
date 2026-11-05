import { describe, expect, it } from 'vitest'
import { connectedSummary, TILE_COLOR, weatherTileFacts } from './connector-tiles'
import { ORB_COLOR } from './orbs'
import type { ForecastData } from './weather'

const hours = (date: string) => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`)

function forecast(probs: Record<string, number>, over: Partial<ForecastData['daily']> = {}): ForecastData {
  const time = [...hours('2026-11-03'), ...hours('2026-11-04')]
  return {
    current: { time: '2026-11-03T13:30', temperature_2m: 31.6, apparent_temperature: 35, weather_code: 2, wind_speed_10m: 10, precipitation: 0 },
    hourly: { time, precipitation_probability: time.map((t) => probs[t] ?? 0), temperature_2m: time.map(() => 30) },
    daily: { time: ['2026-11-03'], weather_code: [2], temperature_2m_max: [33.4], temperature_2m_min: [26.2], precipitation_probability_max: [10], ...over },
  }
}

const NOW = new Date(2026, 10, 3, 13, 30)

describe('weatherTileFacts', () => {
  it('formats temp and capitalised condition', () => {
    const f = weatherTileFacts(forecast({}), NOW)
    expect(f.temp).toBe('32°')
    expect(f.condition).toBe('Partly cloudy')
  })
  it('hints the first >=50 slot at or after the current hour, ignoring earlier hours and tomorrow', () => {
    const f = weatherTileFacts(forecast({ '2026-11-03T09:00': 90, '2026-11-03T16:00': 60, '2026-11-03T18:00': 80, '2026-11-04T01:00': 90 }), NOW)
    expect(f.hint).toBe('Rain likely around 4 PM')
  })
  it('includes the current hour', () => {
    expect(weatherTileFacts(forecast({ '2026-11-03T13:00': 50 }), NOW).hint).toBe('Rain likely around 1 PM')
  })
  it('ignores tomorrow and falls back to high/low', () => {
    const f = weatherTileFacts(forecast({ '2026-11-04T01:00': 90 }), NOW)
    expect(f.hint).toBe('High 33° · Low 26°')
  })
  it('formats 12 PM and 12 AM', () => {
    expect(weatherTileFacts(forecast({ '2026-11-03T12:00': 70 }), new Date(2026, 10, 3, 11, 5)).hint).toBe('Rain likely around 12 PM')
    expect(weatherTileFacts(forecast({ '2026-11-03T00:00': 70 }), new Date(2026, 10, 3, 0, 5)).hint).toBe('Rain likely around 12 AM')
  })
  it('shows a placeholder when the temperature is not a number', () => {
    const d = forecast({})
    d.current.temperature_2m = NaN
    expect(weatherTileFacts(d, NOW).temp).toBe('--°')
  })
  it('returns empty hint without usable data', () => {
    const f = weatherTileFacts(forecast({}, { temperature_2m_max: [], temperature_2m_min: [] }), NOW)
    expect(f.hint).toBe('')
  })
})

describe('connectedSummary', () => {
  it('counts connected of available', () => {
    expect(connectedSummary([{ status: 'connected' }, { status: 'not_connected' }, { status: 'coming_soon' }, { status: 'coming_soon' }])).toBe('1 of 2 connected')
    expect(connectedSummary([])).toBe('0 of 0 connected')
  })
})

describe('TILE_COLOR', () => {
  it('maps live connectors', () => {
    expect(TILE_COLOR.weather).toBe('#38bdf8')
    expect(TILE_COLOR.nutrition).toBe(ORB_COLOR.health)
    expect(TILE_COLOR['web-search']).toBe(ORB_COLOR.interest)
  })
})
