'use client'

import { calorieFill, waterFill } from '@/lib/echo/body-fill'
import { BodyMeter } from './body-meter'

export type StripDay = { key: string; label: string; water: number | null; kcal: number | null; goal?: number; showCalories: boolean }

const MINI = 54

const longDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** One mini body pair per day. A week is one row; a month wraps on desktop and scrolls inside itself on mobile. */
export function BodyStrip({ days, waterGoal }: { days: StripDay[]; waterGoal: number }) {
  const month = days.length > 7
  return (
    <div className="max-w-full overflow-x-auto">
      <ul className={`flex gap-y-3 ${month ? 'w-max gap-x-3 md:w-auto md:flex-wrap' : 'justify-between'}`}>
        {days.map((d) => {
          const date = longDate(d.key)
          const w = d.water != null ? waterFill(d.water, waterGoal) : null
          const k = d.kcal != null ? calorieFill(d.kcal, d.goal) : null
          return (
            <li key={d.key} className="flex shrink-0 flex-col items-center">
              <div className="flex items-end gap-0.5">
                <BodyMeter kind="water" height={MINI} level={w?.level ?? 0} label={`${date}: ${w ? w.text : 'no water logged'}`} />
                {d.showCalories && <BodyMeter kind="calories" height={MINI} level={k?.level ?? 0} over={k?.over} label={`${date}: ${k ? k.text.replace(' today', '') : 'no meals logged'}`} />}
              </div>
              <span className="mt-1 text-xs tabular-nums text-muted-foreground" aria-hidden="true">
                {d.label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
