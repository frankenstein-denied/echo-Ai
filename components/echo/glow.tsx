import type { ReactNode } from 'react'
import { Clock } from 'lucide-react'
import { ORB_COLOR, ORB_KINDS, type OrbKind } from '@/lib/echo/orbs'
import { tagStyle, timeChipLabel } from '@/lib/echo/glow'
import { OrbSwatch } from './memory-orb'
import { Badge } from './ui/badge'

export function GlowDot({ kind, size = 12 }: { kind: OrbKind; size?: number }) {
  const counts = Object.fromEntries(ORB_KINDS.map((k) => [k, k === kind ? 1 : 0])) as Record<OrbKind, number>
  return <OrbSwatch counts={counts} size={size} />
}

export function KindTag({ kind, children }: { kind: OrbKind | null; children: ReactNode }) {
  if (!kind) return <Badge variant="neutral">{children}</Badge>
  return (
    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" style={tagStyle(kind)}>
      {children}
    </span>
  )
}

export function ProgressRing({ value, size = 36, color = ORB_COLOR.goal, label }: { value: number; size?: number; color?: string; label: string }) {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  const stroke = Math.max(3, Math.round(size / 10))
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, filter: `drop-shadow(0 0 4px ${color}80)` }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - v / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

const CHIP_COLOR = { upcoming: ORB_COLOR.goal, overdue: 'var(--color-danger)', done: 'var(--color-muted-foreground)' } as const

export function TimeChip({ at, state }: { at: Date; state: 'upcoming' | 'overdue' | 'done' }) {
  const color = CHIP_COLOR[state]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      <Clock size={12} aria-hidden />
      {timeChipLabel(at, new Date())}
    </span>
  )
}
