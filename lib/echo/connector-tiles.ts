// Pure helpers for the Connectors page live tiles.
import type { ConnectorId, ConnectorStatus } from './connectors'
import { ORB_COLOR } from './orbs'
import { weatherCodeText, type ForecastData } from './weather'

export const TILE_COLOR: Partial<Record<ConnectorId, string>> = {
  weather: '#38bdf8',
  nutrition: ORB_COLOR.health,
  'web-search': ORB_COLOR.interest,
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

function hour12(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`
}

export function weatherTileFacts(data: ForecastData, now: Date): { temp: string; condition: string; hint: string } {
  const c = data.current
  const text = isNum(c.weather_code) ? weatherCodeText(c.weather_code) : ''
  const p = (n: number) => String(n).padStart(2, '0')
  // "Now" in the forecast location's timezone comes from current.time ('YYYY-MM-DDTHH:MM'); the browser clock is only a fallback.
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):\d{2}/.exec(typeof c.time === 'string' ? c.time : '')
  const date = m ? m[1] : `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const from = `${date}T${m ? m[2] : p(now.getHours())}:00`
  const times = data.hourly?.time ?? []
  const probs = data.hourly?.precipitation_probability ?? []
  let hint = ''
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (t.slice(0, 10) !== date || t < from) continue
    if (isNum(probs[i]) && probs[i] >= 50) {
      hint = `Rain likely around ${hour12(Number(t.slice(11, 13)))}`
      break
    }
  }
  if (!hint) {
    const max = data.daily?.temperature_2m_max?.[0]
    const min = data.daily?.temperature_2m_min?.[0]
    if (isNum(max) && isNum(min)) hint = `High ${Math.round(max)}° · Low ${Math.round(min)}°`
  }
  return { temp: isNum(c.temperature_2m) ? `${Math.round(c.temperature_2m)}°` : '--°', condition: text.charAt(0).toUpperCase() + text.slice(1), hint }
}

export function connectedSummary(statuses: { status: ConnectorStatus }[]): string {
  const available = statuses.filter((s) => s.status !== 'coming_soon')
  return `${available.filter((s) => s.status === 'connected').length} of ${available.length} connected`
}
