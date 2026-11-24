'use client'

import { useId, type ReactNode } from 'react'
import { Activity, Apple, BookOpen, Bot, ChevronDown, Dumbbell, HeartPulse, Route, Search, Sparkles, Zap, Calendar, CalendarDays, Clapperboard, CloudSun, Coins, FileText, GitBranch, Globe, Library, Mail, Newspaper, Plug, ScanBarcode, type LucideIcon } from 'lucide-react'
import { TILE_COLOR } from '@/lib/echo/connector-tiles'
import type { ConnectorDef, ConnectorId, ConnectorStatus } from '@/lib/echo/connectors'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Badge } from '../ui'

const ICONS: Partial<Record<ConnectorId, LucideIcon>> = {
  nutrition: Apple,
  'web-search': Globe,
  weather: CloudSun,
  'google-calendar': Calendar,
  gmail: Mail,
  github: GitBranch,
  notion: FileText,
  wikipedia: Library,
  news: Newspaper,
  currency: Coins,
  holidays: CalendarDays,
  books: BookOpen,
  movies: Clapperboard,
  'food-facts': ScanBarcode,
  claude: Sparkles,
  chatgpt: Bot,
  gemini: Sparkles,
  perplexity: Search,
  groq: Zap,
  openrouter: Route,
  wger: Dumbbell,
  strava: Activity,
  'health-connect': HeartPulse,
}

const NEEDS_COLOR = '#fbbf24'

/**
 * One connector as a slim row: icon in the connector's colour, name, one line under it (an example of what to ask
 * Echo, live weather, or what's missing), and a control on the right (`control`, e.g. a switch or a Connect pill).
 * Tapping the row opens `children` (keys, sign-in, place picker, disconnect) underneath. Rows that need the user glow
 * amber; coming-soon rows are dimmed and don't open.
 */
export function ConnectorRow({
  def,
  status,
  needsYou = false,
  line,
  control,
  open,
  onToggle,
  children,
}: {
  def: ConnectorDef
  status: ConnectorStatus
  needsYou?: boolean
  line: ReactNode
  control?: ReactNode
  open: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  const connected = status === 'connected'
  const soon = status === 'coming_soon'
  const Icon = ICONS[def.id] ?? Plug
  const color = needsYou ? NEEDS_COLOR : (TILE_COLOR[def.id] ?? 'var(--color-primary)')
  const panelId = useId()
  const expandable = !soon && !!children
  const head = (
    <>
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-[11px] ${soon ? 'text-muted-foreground opacity-60' : ''}`}
        style={soon ? { background: 'var(--color-surface-2)' } : { background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{def.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{line}</span>
      </span>
    </>
  )
  return (
    <div
      className="rounded-xl border border-border bg-surface"
      style={
        needsYou
          ? { borderColor: `color-mix(in srgb, ${NEEDS_COLOR} 30%, var(--color-border))`, boxShadow: `0 0 22px -12px ${NEEDS_COLOR}` }
          : connected
            ? { borderColor: `color-mix(in srgb, ${color} 25%, var(--color-border))` }
            : soon
              ? { background: 'var(--color-background)' }
              : undefined
      }
    >
      <div className="flex items-center gap-2 py-1 pl-3 pr-2">
        {expandable ? (
          <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left ${FOCUS_RING}`}>
            {head}
            <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        ) : (
          <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1">{head}</div>
        )}
        {soon ? (
          <span className="shrink-0 whitespace-nowrap">
            <Badge variant="neutral">Soon</Badge>
          </span>
        ) : (
          control
        )}
        {!soon && <span className="sr-only">{connected ? 'Connected' : needsYou ? 'Needs you' : 'Not connected'}</span>}
      </div>
      {expandable && (
        <div id={panelId} hidden={!open} className="border-t border-border px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  )
}
