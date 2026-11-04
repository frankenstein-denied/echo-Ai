'use client'

import { useEffect, useId, useState } from 'react'
import { KCAL_FROM, KCAL_TO, OVER_GLOW, WATER_COLOR, WATER_DEEP } from '@/lib/echo/glow'

type Pt = [number, number]
type Seg = [Pt, Pt, Pt] // cubic: control 1, control 2, end

// Right half of a faceless male figure in a 120 x 300 box, from the top of the head down to the crotch.
// The left half is its mirror image, so the outline stays symmetric and smooth.
const START: Pt = [60, 6]
const RIGHT: Seg[] = [
  [[69, 6], [75, 13], [75, 24]], // crown to temple
  [[75, 34], [73, 41], [69, 44]], // jaw
  [[67, 46], [67, 49], [68, 52]], // neck
  [[72, 56], [84, 57], [91, 61]], // trapezius
  [[98, 64], [101, 71], [101, 80]], // shoulder
  [[102, 96], [104, 112], [105, 126]], // upper arm, outside
  [[106, 140], [107, 151], [107, 161]], // forearm, outside
  [[108, 169], [105, 175], [101, 175]], // hand
  [[97, 175], [96, 168], [96, 161]],
  [[95, 150], [94, 138], [93, 126]], // forearm, inside
  [[92, 112], [90, 98], [88, 88]], // upper arm up to the armpit
  [[88, 104], [85, 120], [85, 134]], // flank to the waist
  [[85, 146], [88, 156], [88, 166]], // hip
  [[88, 190], [85, 212], [83, 232]], // thigh, outside
  [[82, 250], [80, 266], [79, 280]], // calf
  [[80, 286], [83, 292], [78, 294]], // foot
  [[73, 295], [67, 295], [66, 291]],
  [[65, 278], [66, 262], [66, 246]], // ankle and calf, inside
  [[65, 228], [64, 210], [63, 194]], // knee and thigh, inside
  [[62, 184], [61, 177], [60, 174]], // crotch
]

const mirror = ([x, y]: Pt): Pt => [120 - x, y]
const fmt = ([x, y]: Pt) => `${x},${y}`

function bodyPath(): string {
  const ends = [START, ...RIGHT.map((s) => s[2])]
  let d = `M${fmt(START)}`
  for (const [c1, c2, e] of RIGHT) d += ` C${fmt(c1)} ${fmt(c2)} ${fmt(e)}`
  for (let i = RIGHT.length - 1; i >= 0; i--) {
    const [c1, c2] = RIGHT[i]
    d += ` C${fmt(mirror(c2))} ${fmt(mirror(c1))} ${fmt(mirror(ends[i]))}`
  }
  return `${d} Z`
}

const BODY = bodyPath()
const TOP = 6
const BOTTOM = 295
const SPAN = BOTTOM - TOP

// A periodic wave (wavelength 40) wide enough to slide left by one wavelength without showing an edge.
function wavePath(amp: number): string {
  let d = `M-40,0`
  for (let x = -40; x < 200; x += 40) d += ` Q${x + 10},${-amp} ${x + 20},0 T${x + 40},0`
  return `${d} V${SPAN + 20} H-40 Z`
}
const WAVE = wavePath(3.2)
const WAVE_BACK = wavePath(2.2)

const FILL = {
  water: { from: WATER_DEEP, to: WATER_COLOR, band: '#bae6fd' },
  calories: { from: KCAL_FROM, to: KCAL_TO, band: '#fde68a' },
} as const

export function BodyMeter({ kind, level, over = false, label, height = 260 }: { kind: 'water' | 'calories'; level: number; over?: boolean; label: string; height?: number }) {
  const raw = useId()
  const id = `body${raw.replace(/[^a-zA-Z0-9]/g, '')}`
  const mini = height < 100
  const target = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0))
  // Start empty and rise to the level once mounted, so the first view animates too.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(target))
    return () => cancelAnimationFrame(r)
  }, [target])

  const c = FILL[kind]
  // At level 0 the surface sits just below the feet so the wave crest never shows.
  const surface = BOTTOM + 5 - shown * (SPAN + 5)
  const isOver = kind === 'calories' && over
  const width = (height * 120) / 300

  return (
    <svg role="img" aria-label={label} viewBox="0 0 120 300" width={width} height={height} className="block shrink-0 overflow-visible">
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={BODY} />
        </clipPath>
        <linearGradient id={`${id}-grad`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={c.from} />
          <stop offset="1" stopColor={c.to} />
        </linearGradient>
        <linearGradient id={`${id}-over`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={OVER_GLOW} stopOpacity="0.95" />
          <stop offset="1" stopColor={OVER_GLOW} stopOpacity="0" />
        </linearGradient>
        {!mini && (
          <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        )}
      </defs>

      {/* Soft outer glow in the fill color, stronger as the body fills. */}
      {!mini && (
        <path d={BODY} fill={c.to} filter={`url(#${id}-blur)`} className="body-fade" style={{ opacity: 0.08 + 0.3 * shown }} />
      )}
      {!mini && isOver && <ellipse cx="60" cy="26" rx="34" ry="30" fill={OVER_GLOW} filter={`url(#${id}-blur)`} opacity="0.55" />}

      <path d={BODY} fill="rgba(148, 163, 184, 0.10)" />

      <g clipPath={`url(#${id}-clip)`}>
        <g className="body-fill" style={{ transform: `translateY(${surface}px)` }}>
          {kind === 'water' ? (
            <>
              {!mini && (
                <g className="body-wave-slow">
                  <path d={WAVE_BACK} transform="translate(-14 -2)" fill={c.to} opacity="0.35" />
                </g>
              )}
              <g className={mini ? undefined : 'body-wave'}>
                <path d={WAVE} fill={`url(#${id}-grad)`} />
              </g>
            </>
          ) : (
            <>
              <rect x="0" y="0" width="120" height={SPAN + 20} fill={`url(#${id}-grad)`} />
              {/* Soft bright band at the surface. */}
              <rect x="0" y="-3" width="120" height="8" fill={c.band} opacity="0.55" filter={mini ? undefined : `url(#${id}-blur)`} />
            </>
          )}
        </g>
        {isOver && <rect x="0" y="0" width="120" height="70" fill={`url(#${id}-over)`} />}
      </g>

      <path d={BODY} fill="none" stroke={isOver ? OVER_GLOW : c.to} strokeOpacity={mini ? 0.45 : 0.5} strokeWidth={mini ? 4 : 1.5} strokeLinejoin="round" />
    </svg>
  )
}
