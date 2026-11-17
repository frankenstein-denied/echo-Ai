'use client'

import type { ReactNode } from 'react'
import { Apple, Calendar, CloudSun, FileText, GitBranch, Globe, Mail, Music, Plug, type LucideIcon } from 'lucide-react'
import { TILE_COLOR } from '@/lib/echo/connector-tiles'
import type { ConnectorDef, ConnectorId, ConnectorStatus } from '@/lib/echo/connectors'
import { Badge, Card } from '../ui'

const ICONS: Partial<Record<ConnectorId, LucideIcon>> = {
  nutrition: Apple,
  'web-search': Globe,
  weather: CloudSun,
  spotify: Music,
  'google-calendar': Calendar,
  gmail: Mail,
  github: GitBranch,
  notion: FileText,
}

/**
 * Card shell for one connector: icon, name and status. Connected cards glow in the connector's colour; not-connected
 * cards are dashed; coming-soon cards are dimmed with a label. `children` is the card body (live data and actions).
 */
export function ConnectorCard({ def, status, children }: { def: ConnectorDef; status: ConnectorStatus; children?: ReactNode }) {
  const connected = status === 'connected'
  const soon = status === 'coming_soon'
  const Icon = ICONS[def.id] ?? Plug
  const color = TILE_COLOR[def.id] ?? 'var(--color-accent)'
  return (
    <Card
      className={`flex flex-col ${connected ? '' : 'border-dashed'} ${soon ? 'opacity-60' : ''}`}
      style={
        connected
          ? {
              background: `linear-gradient(160deg, color-mix(in srgb, ${color} 18%, transparent), transparent 60%), var(--color-surface)`,
              borderColor: `color-mix(in srgb, ${color} 35%, var(--color-border))`,
              boxShadow: `0 0 22px -12px ${color}`,
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground" style={connected ? { color } : undefined}>
            <Icon size={18} aria-hidden="true" />
          </span>
          <h3 className="truncate text-base font-semibold text-foreground">{def.name}</h3>
        </div>
        {soon ? (
          <Badge variant="neutral">Coming soon</Badge>
        ) : connected ? (
          <span className="size-2 shrink-0 rounded-full bg-success" style={{ boxShadow: '0 0 8px var(--color-success)' }}>
            <span className="sr-only">Connected</span>
          </span>
        ) : (
          <span className="sr-only">Not connected</span>
        )}
      </div>
      {soon && <p className="mt-3 flex-1 text-sm text-muted-foreground">{def.description}</p>}
      {children}
    </Card>
  )
}
