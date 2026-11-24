'use client'

/**
 * Mobile navigation (< 1024 px): MobileTabBar (fixed bottom tab bar: Today, Notes, the Echo orb, Reminders, More),
 * MobileTitleBar (compact sticky page title bar under the top safe area) and the More sheet (profile row + six tiles).
 * The tab bar hides itself while a text field is focused or a call is active (see globals.css `.mobile-tabbar`).
 */
import type { CSSProperties, ReactNode } from 'react'
import { Bell, BookOpen, Brain, Feather, FileText, HeartPulse, LayoutGrid, Mic, Music, Network, Settings, Target, type LucideIcon } from 'lucide-react'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { ORB_COLOR } from '@/lib/echo/orbs'
import type { NavName } from '@/lib/echo/sidebar'
import { GuideInfoButton } from './guide'
import { Sheet } from './sheet'

/** Every page the shell can show. 'Today' is the mobile home (greeting, today's page, up next, Echo noticed). */
export type TabView = NavName | 'Today'

const TABS: { name: TabView; label: string; icon: LucideIcon }[] = [
  { name: 'Today', label: 'Today', icon: BookOpen },
  { name: 'Notes', label: 'Notes', icon: FileText },
  { name: 'Reminders', label: 'Reminders', icon: Bell },
]

export const MORE_VIEWS: { name: TabView; icon: LucideIcon; color: string; description: string }[] = [
  { name: 'Goals', icon: Target, color: ORB_COLOR.goal, description: 'Progress and milestones' },
  { name: 'Health', icon: HeartPulse, color: ORB_COLOR.health, description: 'Mood, sleep, water, energy' },
  { name: '2nd Brain', icon: Brain, color: ORB_COLOR.interest, description: 'Everything Echo remembers' },
  { name: 'Music', icon: Music, color: ORB_COLOR.person, description: 'YouTube links and playlists' },
  { name: 'Connectors', icon: Network, color: ORB_COLOR.note, description: 'Linked tools' },
  { name: 'Legacy', icon: Feather, color: 'var(--color-muted-foreground)', description: 'Who inherits your Echo' },
]

/** Echo's orb gradient (tab bar button, Echo sheet). */
export const ECHO_ORB_STYLE: CSSProperties = {
  background: 'radial-gradient(circle at 32% 28%, #a7f3d0, #2dd4bf 38%, #0f766e 78%)',
}

/** Which tab lights up: the diary belongs to Today; the More pages and Settings to More. */
export function activeTab(view: TabView): TabView | 'More' {
  if (view === 'Diary') return 'Today'
  if (view === 'Settings' || MORE_VIEWS.some((m) => m.name === view)) return 'More'
  return view
}

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

export function MobileTabBar({ view, onSelect, moreOpen, onMore, echoOpen = false, onEcho }: { view: TabView; onSelect: (v: TabView) => void; moreOpen: boolean; onMore: () => void; echoOpen?: boolean; onEcho: () => void }) {
  const tab = activeTab(view)
  const [today, notes, reminders] = TABS.map((t) => <TabButton key={t.name} label={t.label} icon={t.icon} active={tab === t.name} onClick={() => onSelect(t.name)} />)
  return (
    <nav aria-label="Tabs" className="mobile-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden">
      <div className="mx-auto flex h-14 max-w-lg items-stretch px-1 py-1">
        {today}
        {notes}
        <div className="flex min-w-0 flex-1 justify-center">
          <button
            type="button"
            onClick={onEcho}
            aria-label="Tell Echo"
            aria-haspopup="dialog"
            aria-expanded={echoOpen}
            className="-mt-7 grid size-14 shrink-0 place-items-center rounded-full text-primary-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{ ...ECHO_ORB_STYLE, boxShadow: '0 0 0 5px var(--color-surface), 0 0 26px #2dd4bf88, inset 0 -6px 12px #0b4f48' }}
          >
            <Mic size={22} aria-hidden="true" />
          </button>
        </div>
        {reminders}
        <TabButton label="More" icon={LayoutGrid} active={tab === 'More'} onClick={onMore} aria-haspopup="dialog" aria-expanded={moreOpen} />
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
        <GuideInfoButton />
      </div>
    </div>
  )
}

/** More: profile row with Settings, then the six other pages as coloured tiles. Sign out lives in Settings. */
export function MoreSheet({ open, onClose, view, onSelect, userName, email, days }: { open: boolean; onClose: () => void; view: TabView; onSelect: (v: TabView) => void; userName: string; email?: string | null; days: number | null }) {
  const go = (v: TabView) => {
    onClose()
    onSelect(v)
  }
  return (
    <Sheet open={open} onClose={onClose} title="More">
      <div className="mb-3 flex items-center gap-3 px-2">
        <div aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-primary-foreground" style={{ background: 'linear-gradient(135deg, #2dd4bf, #3b82f6)' }}>
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">{days !== null ? `Day ${days} with Echo` : email}</p>
        </div>
        <button
          type="button"
          onClick={() => go('Settings')}
          aria-label="Settings"
          aria-current={view === 'Settings' ? 'page' : undefined}
          className={`grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 ${view === 'Settings' ? 'text-primary' : 'text-muted-foreground'} ${FOCUS_RING}`}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </div>
      <nav aria-label="More pages" className="grid grid-cols-3 gap-2 px-2 pb-2">
        {MORE_VIEWS.map((m) => {
          const active = view === m.name
          const Icon = m.icon
          return (
            <button
              key={m.name}
              type="button"
              onClick={() => go(m.name)}
              aria-current={active ? 'page' : undefined}
              title={m.description}
              className={`flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-surface-2 px-1 py-3 text-xs font-medium transition-colors active:bg-surface ${active ? 'text-foreground' : 'border-border text-muted-foreground'} ${FOCUS_RING}`}
              style={active ? { borderColor: `color-mix(in srgb, ${m.color} 55%, transparent)` } : undefined}
            >
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${m.color} 14%, transparent)`, color: m.color }}>
                <Icon size={18} />
              </span>
              <span className="max-w-full truncate">{m.name}</span>
            </button>
          )
        })}
      </nav>
    </Sheet>
  )
}
