// Open-Meteo weather: city search, forecast fetch and the compact WEATHER context block.
// Browser-safe: plain fetch (injectable for tests), no Firebase or server imports.
// Never log coordinates.
import { fetchWithTimeout } from './send-helpers'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const MAX_CHARS = 600

export type Place = { name: string; detail: string; lat: number; lon: number }

export type ForecastData = {
  current: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    weather_code: number
    wind_speed_10m: number
    precipitation: number
  }
  hourly: { time: string[]; precipitation_probability: number[]; temperature_2m: number[] }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
  }
}

export function roundCoord(n: number): number {
  return Math.round(n * 100) / 100
}

export function weatherCodeText(code: number): string {
  if (code === 0) return 'clear'
  if (code === 1) return 'mostly clear'
  if (code === 2) return 'partly cloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code === 65 || code === 67) return 'heavy rain'
  if (code === 61 || code === 63 || code === 66) return 'rain'
  if (code === 71 || code === 73 || code === 75 || code === 77) return 'snow'
  if (code === 80 || code === 81) return 'showers'
  if (code === 82) return 'heavy rain'
  if (code === 85 || code === 86) return 'snow showers'
  if (code === 95 || code === 96 || code === 99) return 'thunderstorm'
  return 'mixed'
}

export async function searchPlaces(name: string, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const q = name.trim()
  if (!q) return []
  const url = `${GEOCODE_URL}?${new URLSearchParams({ name: q, count: '5', language: 'en', format: 'json' })}`
  const res = await fetchWithTimeout(url, {}, 6000, fetchImpl)
  if (!res.ok) throw new Error('Place search failed.')
  const body = (await res.json()) as {
    results?: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[]
  }
  return (body.results ?? []).map((r) => ({
    name: r.name,
    detail: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: roundCoord(r.latitude),
    lon: roundCoord(r.longitude),
  }))
}

export async function fetchForecast(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 6000,
): Promise<ForecastData> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation',
    hourly: 'precipitation_probability,temperature_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '4',
  })
  const res = await fetchWithTimeout(`${FORECAST_URL}?${params}`, {}, timeoutMs, fetchImpl)
  if (!res.ok) throw new Error('Weather lookup failed.')
  const data = (await res.json()) as Partial<ForecastData> | null
  if (
    !data ||
    !isNum(data.current?.temperature_2m) ||
    typeof data.current.time !== 'string'
  ) {
    throw new Error('Weather data was malformed.')
  }
  return data as ForecastData
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? date
}

function localNowString(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:00`
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

export function formatWeather(place: string, data: ForecastData, now: Date = new Date()): string {
  const c = data.current
  const now1 = [`${Math.round(c.temperature_2m)}°C`]
  if (isNum(c.apparent_temperature)) now1[0] += ` (feels ${Math.round(c.apparent_temperature)}°C)`
  if (isNum(c.weather_code)) now1.push(weatherCodeText(c.weather_code))
  if (isNum(c.wind_speed_10m)) now1.push(`wind ${Math.round(c.wind_speed_10m)} km/h`)
  const lines = [`Place: ${place}`, `Now: ${now1.join(', ')}`]

  // Rest of today: hourly values from the current hour to midnight, in the forecast's local time.
  const nowLocal = typeof c.time === 'string' && c.time.length >= 13 ? c.time.slice(0, 13) + ':00' : localNowString(now)
  const today = nowLocal.slice(0, 10)
  let maxTemp: number | null = null
  let maxRain: number | null = null
  let rainHour = ''
  ;(data.hourly?.time ?? []).forEach((t, i) => {
    if (typeof t !== 'string' || t.slice(0, 10) !== today || t < nowLocal) return
    const temp = data.hourly?.temperature_2m?.[i]
    const rain = data.hourly?.precipitation_probability?.[i]
    if (isNum(temp) && (maxTemp === null || temp > maxTemp)) maxTemp = temp
    if (isNum(rain) && (maxRain === null || rain > maxRain)) {
      maxRain = rain
      rainHour = t.slice(11, 16)
    }
  })
  const parts: string[] = []
  if (maxTemp !== null) parts.push(`up to ${Math.round(maxTemp)}°C`)
  if (maxRain !== null) parts.push(`rain chance up to ${Math.round(maxRain)}%${maxRain > 0 ? ` (highest around ${rainHour})` : ''}`)
  if (parts.length) lines.push(`Rest of today: ${parts.join('; ')}`)

  const d = data.daily
  ;(d?.time ?? []).forEach((date, i) => {
    if (typeof date !== 'string' || date <= today) return
    const lo = d?.temperature_2m_min?.[i]
    const hi = d?.temperature_2m_max?.[i]
    if (!isNum(lo) || !isNum(hi)) return
    const code = d?.weather_code?.[i]
    const pop = d?.precipitation_probability_max?.[i]
    const bits = [`${Math.round(lo)}–${Math.round(hi)}°C`]
    if (isNum(code)) bits.push(weatherCodeText(code))
    if (isNum(pop)) bits.push(`${Math.round(pop)}% chance`)
    lines.push(`${dayName(date)}: ${bits.join(', ')}`)
  })

  return lines.join('\n').slice(0, MAX_CHARS)
}
