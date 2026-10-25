'use client'

/**
 * Mobile navigation (< 1024 px): MobileTabBar (fixed bottom tab bar: Diary, Notes, 2nd Brain, Reminders, More),
 * MobileTitleBar (compact sticky page title bar under the top safe area) and the More sheet.
 * The tab bar hides itself while a text field is focused or a call is active (see globals.css `.mobile-tabbar`).
 */
import type { ReactNode } from 'react'
import { BookOpen, Brain, CalendarDays, FileText, HeartPulse, LogOut, MoreHorizontal, Network, Settings, Target, type LucideIcon } from 'lucide-react'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Sheet, SheetItem } from './sheet'

export type TabView = 'Diary' | 'Notes' | 'Goals' | 'Health' | 'Reminders' | 'Connectors' | '2nd Brain' | 'Settings'

const TABS: { name: TabView; label: string; icon: LucideIcon }[] = [
  { name: 'Diary', label: 'Diary', icon: BookOpen },
  { name: 'Notes', label: 'Notes', icon: FileText },
  { name: '2nd Brain', label: '2nd Brain', icon: Brain },
  { name: 'Reminders', label: 'Reminders', icon: CalendarDays },
]

export const MORE_VIEWS: { name: TabView; icon: LucideIcon; description: string }[] = [
  { name: 'Goals', icon: Target, description: 'Progress and milestones' },
  { name: 'Health', icon: HeartPulse, description: 'Mood, sleep, water, energy' },
  { name: 'Connectors', icon: Network, description: 'Linked tools' },
  { name: 'Settings', icon: Settings, description: 'Profile, voice, account' },
]

function TabButton({ label, icon: Icon, active, onClick, ...rest }: { label: string; icon: LucideIcon; active: boolean; onClick: () => void; 'aria-haspopup'?: 'dialog'; 'aria-expanded'?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium leading-4 ${FOCUS_RING} ${active ? 'text-primary' : 'text-muted-foreground active:text-foreground'}`}
      {...rest}
    >
      <span className={`grid h-7 w-14 place-items-center rounded-full transition-colors ${active ? 'bg-primary-soft' : ''}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  )
}

export function MobileTabBar({ view, onSelect, moreOpen, onMore }: { view: TabView; onSelect: (v: TabView) => void; moreOpen: boolean; onMore: () => void }) {
  const inMore = MORE_VIEWS.some((m) => m.name === view)
  return (
    <nav aria-label="Tabs" className="mobile-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden">
      <div className="mx-auto flex h-14 max-w-lg items-stretch px-1 py-1">
        {TABS.map((t) => (
          <TabButton key={t.name} label={t.label} icon={t.icon} active={view === t.name} onClick={() => onSelect(t.name)} />
        ))}
        <TabButton label="More" icon={MoreHorizontal} active={inMore} onClick={onMore} aria-haspopup="dialog" aria-expanded={moreOpen} />
      </div>
    </nav>
  )
}

export function MobileTitleBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 -mt-4 mb-4 border-b border-border bg-background pt-[env(safe-area-inset-top)] md:-mx-8 md:-mt-8 md:mb-6 lg:hidden">
      <div className="flex h-12 items-center gap-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:pl-[max(2rem,env(safe-area-inset-left))] md:pr-[max(2rem,env(safe-area-inset-right))]">
        <p aria-hidden="true" className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
          {title}
        </p>
        {children}
      </div>
    </div>
  )
}

export function MoreSheet({ open, onClose, view, onSelect, userName, email, days, onSignOut }: { open: boolean; onClose: () => void; view: TabView; onSelect: (v: TabView) => void; userName: string; email?: string | null; days: number | null; onSignOut: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="More">
      <div className="mb-2 flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-3">
        <div aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-sm font-semibold text-foreground">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {email}
            {days !== null ? ` · Day ${days} with Echo` : ''}
          </p>
        </div>
      </div>
      <nav aria-label="More pages" className="grid gap-1">
        {MORE_VIEWS.map((m) => (
          <SheetItem
            key={m.name}
            icon={m.icon}
            label={m.name}
            description={m.description}
            active={view === m.name}
            aria-current={view === m.name ? 'page' : undefined}
            onClick={() => {
              onClose()
              onSelect(m.name)
            }}
          />
        ))}
      </nav>
      <div className="mt-2 border-t border-border pt-2">
        <SheetItem
          icon={LogOut}
          label="Sign out"
          tone="danger"
          onClick={() => {
            onClose()
            onSignOut()
          }}
        />
      </div>
    </Sheet>
  )
}
