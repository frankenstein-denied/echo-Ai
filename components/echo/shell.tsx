'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BookOpen, Brain, CalendarDays, FileText, HeartPulse, LogOut, Menu, Network, PanelLeftClose, PanelLeftOpen, Settings, Target, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import type { UserProfile } from '@/lib/firestore'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { EchoMark, IconButton } from './ui'
import { DiaryView } from './diary-view'
import { SettingsView } from './settings'
import { NotesView } from './notes-view'
import { GoalsView } from './goals-view'
import { HealthView } from './health-view'
import { RemindersView } from './reminders-view'
import { ConnectorsView } from './connectors-view'
import { BrainView } from './brain-view'

export type View = 'Diary' | 'Notes' | 'Goals' | 'Health' | 'Reminders' | 'Connectors' | '2nd Brain' | 'Settings'

const NAV: { name: View; icon: LucideIcon }[] = [
  { name: 'Diary', icon: BookOpen },
  { name: 'Notes', icon: FileText },
  { name: 'Goals', icon: Target },
  { name: 'Health', icon: HeartPulse },
  { name: 'Reminders', icon: CalendarDays },
  { name: 'Connectors', icon: Network },
  { name: '2nd Brain', icon: Brain },
  { name: 'Settings', icon: Settings },
]

function NavList({ view, onSelect, collapsed = false }: { view: View; onSelect: (v: View) => void; collapsed?: boolean }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
      {NAV.map(({ name, icon: Icon }) => {
        const active = view === name
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            aria-current={active ? 'page' : undefined}
            aria-label={collapsed ? name : undefined}
            title={collapsed ? name : undefined}
            className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${FOCUS_RING} ${collapsed ? 'justify-center' : ''} ${active ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`}
          >
            {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
            <Icon size={20} aria-hidden="true" />
            {!collapsed && <span>{name}</span>}
          </button>
        )
      })}
    </nav>
  )
}

function UserFooter({ collapsed = false }: { collapsed?: boolean }) {
  const { user, signOut } = useAuth()
  const userName = user?.displayName || user?.email?.split('@')[0] || 'You'
  return (
    <div className={`flex items-center gap-3 border-t border-border pt-4 ${collapsed ? 'flex-col' : ''}`}>
      <div aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-foreground">
        {userName.charAt(0).toUpperCase()}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      )}
      <IconButton icon={LogOut} label="Sign out" size="sm" onClick={() => void signOut()} />
    </div>
  )
}

function Sidebar({ view, setView, collapsed, setCollapsed, days }: { view: View; setView: (v: View) => void; collapsed: boolean; setCollapsed: (x: boolean) => void; days: number | null }) {
  return (
    <aside className={`${collapsed ? 'w-20' : 'w-64'} hidden shrink-0 flex-col border-r border-border bg-surface p-4 transition-[width] lg:flex`}>
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
      <NavList view={view} onSelect={setView} collapsed={collapsed} />
      {days !== null && !collapsed && <p className="mb-3 px-1 text-xs text-muted-foreground">Day {days} with Echo</p>}
      <UserFooter collapsed={collapsed} />
    </aside>
  )
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function MobileDrawer({ view, onSelect, onClose }: { view: View; onSelect: (v: View) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    // Drawer is mobile-only: close it if the viewport grows to desktop while open.
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose()
    }
    mq.addEventListener('change', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
      document.body.style.overflow = prevOverflow
      previous?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden" onKeyDown={onKeyDown}>
      <div aria-hidden="true" className="absolute inset-0 bg-background/80" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface p-4">
        <div className="mb-6 flex items-center gap-3 px-1">
          <EchoMark small />
          <span className="text-lg font-semibold text-foreground">Echo</span>
          <IconButton icon={X} label="Close navigation" size="sm" onClick={onClose} className="ml-auto" />
        </div>
        <NavList view={view} onSelect={onSelect} />
        <UserFooter />
      </div>
    </div>
  )
}

function daysWithEcho(profile: UserProfile): number | null {
  const created = profile.createdAt?.toDate?.()
  if (!created) return null
  return Math.max(1, Math.floor((Date.now() - created.getTime()) / 86400000) + 1)
}

export function Dashboard({ profile }: { profile: UserProfile }) {
  const { user, signOut } = useAuth()
  const [view, setView] = useState<View>('Diary')
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const days = daysWithEcho(profile)

  const navigate = useCallback((v: View) => {
    setView(v)
    setDrawer(false)
  }, [])

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed} days={days} />
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center gap-3 border-b border-border px-4 lg:hidden">
          <IconButton icon={Menu} label="Open navigation" onClick={() => setDrawer(true)} aria-haspopup="dialog" aria-expanded={drawer} />
          <span className="text-base font-semibold text-foreground">Echo</span>
          {days !== null && <p className="ml-auto text-xs text-muted-foreground">Day {days} with Echo</p>}
        </header>
        <main className="mx-auto max-w-[1500px] p-4 md:p-8">
          {!user ? null : view === 'Diary' ? (
            <DiaryView user={user} profile={profile} onNavigate={navigate} />
          ) : view === 'Notes' ? (
            <NotesView uid={user.uid} />
          ) : view === 'Goals' ? (
            <GoalsView uid={user.uid} />
          ) : view === 'Health' ? (
            <HealthView uid={user.uid} />
          ) : view === 'Reminders' ? (
            <RemindersView uid={user.uid} />
          ) : view === 'Connectors' ? (
            <ConnectorsView uid={user.uid} />
          ) : view === '2nd Brain' ? (
            <BrainView uid={user.uid} />
          ) : (
            <SettingsView user={user} profile={profile} signOut={signOut} />
          )}
        </main>
      </div>
      {drawer && <MobileDrawer view={view} onSelect={navigate} onClose={() => setDrawer(false)} />}
    </div>
  )
}
