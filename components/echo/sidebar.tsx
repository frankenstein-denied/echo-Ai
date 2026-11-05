'use client'

import type { CSSProperties } from 'react'
import { LogOut, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { BRAIN_GRADIENT, NAV_COLOR, NAV_GROUPS, type NavName, type WeekDay } from '@/lib/echo/sidebar'
import { EchoMark, IconButton } from './ui'
import { OrbSwatch } from './memory-orb'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function navColor(name: Exclude<NavName, 'Settings'>): string {
  return name === '2nd Brain' ? ORB_COLOR.interest : NAV_COLOR[name]
}

function NavList({ view, onSelect, collapsed, dueCount }: { view: NavName; onSelect: (v: NavName) => void; collapsed: boolean; dueCount: number }) {
  return (
    <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.label} className="flex flex-col gap-1">
          {collapsed ? (
            gi > 0 && <div aria-hidden="true" className="my-2 h-px bg-border" />
          ) : (
            <p className={`px-3 text-[10px] uppercase tracking-wider text-muted-foreground ${gi > 0 ? 'mt-3' : ''}`}>{group.label}</p>
          )}
          {group.items.map((name) => {
            const active = view === name
            const c = navColor(name)
            const dotColor = name === '2nd Brain' ? BRAIN_GRADIENT : c
            const showBadge = name === 'Reminders' && dueCount > 0
            const label = showBadge && collapsed ? `Reminders, ${dueCount} due` : collapsed ? name : undefined
            const style: CSSProperties | undefined = active
              ? {
                  background: `color-mix(in srgb, ${c} 14%, transparent)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 35%, transparent), 0 0 18px -6px ${c}`,
                  color: `color-mix(in srgb, ${c} 55%, white)`,
                }
              : undefined
            return (
              <button
                key={name}
                type="button"
                onClick={() => onSelect(name)}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                title={label}
                style={style}
                className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${FOCUS_RING} ${collapsed ? 'justify-center' : ''} ${active ? '' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`}
              >
                <span className="relative flex size-[10px] shrink-0">
                  <span aria-hidden="true" className="size-[10px] rounded-full" style={{ background: dotColor, boxShadow: `0 0 8px ${c}` }} />
                  {showBadge && collapsed && <span aria-hidden="true" className="absolute -right-1 -top-1 size-2 rounded-full bg-danger" />}
                </span>
                {!collapsed && <span>{name}</span>}
                {showBadge && !collapsed && (
                  <span
                    aria-label={`${dueCount} due`}
                    className="ml-auto rounded-full px-2 text-[11px] font-semibold"
                    style={{
                      background: 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
                      color: 'color-mix(in srgb, var(--color-danger) 80%, white)',
                    }}
                  >
                    {dueCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function WeekCard({ days, week, onOpenPage }: { days: number | null; week: WeekDay[]; onOpenPage: (pageId: string) => void }) {
  return (
    <div className="mb-3 shrink-0 rounded-xl border border-border p-3">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        {days !== null ? <span className="font-medium text-foreground">Day {days}</span> : <span />}
        <span className="text-muted-foreground">This week</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {week.map((d, i) => {
          const name = WEEKDAYS[i]
          const ring = d.isToday ? 'outline outline-1 outline-offset-2 outline-primary' : ''
          return (
            <div key={d.date} className="flex flex-col items-center gap-1">
              {d.state === 'used' && d.pageId ? (
                <button
                  type="button"
                  aria-label={`Open ${name}'s diary page`}
                  onClick={() => onOpenPage(d.pageId!)}
                  className={`grid size-[18px] place-items-center rounded-full ${ring} ${FOCUS_RING}`}
                >
                  <OrbSwatch counts={d.counts} size={18} />
                </button>
              ) : (
                <span
                  role="img"
                  aria-label={`${name}, ${d.state === 'future' ? 'upcoming' : 'no diary'}`}
                  className={`size-[18px] rounded-full ${ring} ${d.state === 'future' ? 'border border-dashed border-border-strong' : 'bg-surface-2'}`}
                />
              )}
              <span aria-hidden="true" className={`text-[10px] ${d.isToday ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {d.letter}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UserFooter({ collapsed, settingsActive, onSettings }: { collapsed: boolean; settingsActive: boolean; onSettings: () => void }) {
  const { user, signOut } = useAuth()
  const userName = user?.displayName || user?.email?.split('@')[0] || 'You'
  return (
    <div className={`flex shrink-0 items-center gap-3 border-t border-border pt-4 ${collapsed ? 'flex-col' : ''}`}>
      <div aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-foreground">
        {userName.charAt(0).toUpperCase()}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      )}
      <div className={`flex gap-1 ${collapsed ? 'flex-col' : ''}`}>
        <IconButton
          icon={Settings}
          label="Settings"
          size="sm"
          onClick={onSettings}
          aria-current={settingsActive ? 'page' : undefined}
          className={settingsActive ? 'bg-primary-soft text-primary' : ''}
        />
        <IconButton icon={LogOut} label="Sign out" size="sm" onClick={() => void signOut()} />
      </div>
    </div>
  )
}

export function Sidebar({
  view,
  setView,
  collapsed,
  setCollapsed,
  days,
  dueCount,
  week,
  onOpenPage,
}: {
  view: NavName
  setView: (v: NavName) => void
  collapsed: boolean
  setCollapsed: (x: boolean) => void
  days: number | null
  dueCount: number
  week: WeekDay[]
  onOpenPage: (pageId: string) => void
}) {
  return (
    <aside className={`${collapsed ? 'w-20' : 'w-64'} hidden shrink-0 flex-col border-r border-border bg-surface p-4 transition-[width] lg:sticky lg:top-0 lg:flex lg:h-dvh`}>
      <div className={`mb-6 flex items-center gap-3 px-1 ${collapsed ? 'flex-col' : ''}`}>
        <EchoMark small />
        {!collapsed && <span className="text-lg font-semibold text-foreground">Echo</span>}
        <IconButton
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={collapsed ? '' : 'ml-auto'}
        />
      </div>
      <NavList view={view} onSelect={setView} collapsed={collapsed} dueCount={dueCount} />
      {!collapsed && <WeekCard days={days} week={week} onOpenPage={onOpenPage} />}
      <UserFooter collapsed={collapsed} settingsActive={view === 'Settings'} onSettings={() => setView('Settings')} />
    </aside>
  )
}
