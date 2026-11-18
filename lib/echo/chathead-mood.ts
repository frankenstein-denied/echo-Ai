/** What the Android chathead reacts to: rain coming soon (an umbrella). Music playing is reported by the player. */

const HOUR_MS = 3600_000
export const RAIN_LOOKAHEAD_HOURS = 3
export const RAIN_LIKELY_PERCENT = 50

type ForecastLike = {
  hourly?: { time?: string[]; precipitation_probability?: number[] }
  utc_offset_seconds?: number
}

/**
 * When the likely rain in the next few hours ends (epoch ms), or 0 for none. Hourly times are the forecast's
 * local clock, so the forecast's UTC offset turns them into real instants.
 */
export function rainUntilMs(f: ForecastLike, nowMs: number): number {
  const times = f.hourly?.time ?? []
  const probs = f.hourly?.precipitation_probability ?? []
  const offsetMs = (f.utc_offset_seconds ?? 0) * 1000
  const horizon = nowMs + RAIN_LOOKAHEAD_HOURS * HOUR_MS
  let until = 0
  times.forEach((t, i) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t)
    const p = probs[i]
    if (!m || typeof p !== 'number' || p < RAIN_LIKELY_PERCENT) return
    const start = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - offsetMs
    const end = start + HOUR_MS
    if (end > nowMs && start < horizon) until = Math.max(until, end)
  })
  return until
}
