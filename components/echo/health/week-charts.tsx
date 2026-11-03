'use client'

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MOOD_LABELS, type HealthWeekPoint } from '@/lib/echo/health-helpers'
import { MOOD_ICONS } from './mood-picker'

const AXIS = { stroke: 'var(--color-border-strong)', tick: { fill: 'var(--color-muted-foreground)' }, fontSize: 12, tickLine: false } as const
const TOOLTIP_STYLE = { background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, color: 'var(--color-foreground)' }

type TickProps = { x?: number | string; y?: number | string; payload?: { index?: number; value?: string }; points: HealthWeekPoint[]; icons: boolean }

// Longer ranges (a month, 90 days) show about 7 axis labels and drop the per-day mood icons so they stay readable on mobile.
const isDense = (points: HealthWeekPoint[]) => points.length > 7
const labelInterval = (points: HealthWeekPoint[]) => (isDense(points) ? Math.ceil(points.length / 7) - 1 : 0)

// Day label with that day's mood icon underneath.
function MoodTick({ x = 0, y = 0, payload, points, icons }: TickProps) {
  const point = points[payload?.index ?? -1]
  const Icon = icons && point?.moodTag ? MOOD_ICONS[point.moodTag] : null
  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      <text y={14} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize={12}>
        {payload?.value}
      </text>
      {Icon && point?.moodTag && (
        <g role="img" aria-label={`${payload?.value}: ${MOOD_LABELS[point.moodTag]}`} color="var(--color-primary)">
          <Icon x={-10} y={22} width={20} height={20} />
        </g>
      )}
    </g>
  )
}

export function MoodWeekChart({ points }: { points: HealthWeekPoint[] }) {
  const dense = isDense(points)
  return (
    <div className={dense ? 'h-48' : 'h-56'}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: dense ? 0 : 28, left: -20 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" interval={labelInterval(points)} height={dense ? 30 : 50} tick={(p) => <MoodTick {...p} points={points} icons={!dense} />} stroke={AXIS.stroke} tickLine={false} />
          <YAxis domain={[0, 10]} ticks={[0, 5, 10]} {...AXIS} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, _n, item) => {
              const tag = (item?.payload as HealthWeekPoint | undefined)?.moodTag
              return [tag ? `${MOOD_LABELS[tag]} (${v}/10)` : `${v}/10`, 'Mood']
            }}
          />
          <Line type="monotone" dataKey="mood" name="Mood" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: dense ? 2.5 : 4, fill: 'var(--color-primary)' }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CaloriesWeekChart({ points, goal }: { points: HealthWeekPoint[]; goal?: number }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" {...(isDense(points) ? { interval: labelInterval(points) } : {})} {...AXIS} />
          <YAxis allowDecimals={false} {...AXIS} />
          <Tooltip cursor={{ fill: 'var(--color-surface-2)' }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} kcal`, 'Calories']} />
          {goal ? <ReferenceLine y={goal} stroke="var(--color-warning)" strokeDasharray="4 4" /> : null}
          <Bar dataKey="calories" name="Calories" fill="var(--color-primary)" radius={isDense(points) ? [2, 2, 0, 0] : [4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
