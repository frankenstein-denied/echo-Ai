'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Brain, CalendarDays, FileText, HeartPulse, LogOut, Network, PanelLeftClose, PanelLeftOpen, Settings, Target, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { setConnectorSecret, type UserProfile } from '@/lib/firestore'
import { revokeTavilyLogin, startTavilyLogin, verifyTavilyLogin } from '@/lib/echo/client'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { EchoMark, IconButton } from './ui'
import { DiaryView } from './diary-view'
import { SettingsView } from './settings'
import { NotesView } from './notes-view'
import { GoalsView } from './goals-view'
import { HealthView } from './health-view'
import { RemindersView } from './reminders-view'
import { ConnectorsView, type ConnectorNotice } from './connectors-view'
import { BrainView } from './brain-view'
import { MobileTabBar, MobileTitleBar, MoreSheet } from './mobile-tabbar'
import { useMobileViewportSync } from './use-mobile'

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

const DIARY_MAIN = 'lg:h-dvh lg:p-0'
const DEFAULT_MAIN = 'mx-auto max-w-[1500px]'

const TAVILY_NOTICES: Record<string, ConnectorNotice> = {
  cancelled: { variant: 'warning', text: 'Tavily login was cancelled.' },
  expired: { variant: 'warning', text: 'That login took too long. Try again.' },
  failed: { variant: 'danger', text: "Couldn't connect Web search. Try again." },
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
  const [more, setMore] = useState(false)
  const [connectorNotice, setConnectorNotice] = useState<ConnectorNotice | null>(null)
  const days = daysWithEcho(profile)
  useMobileViewportSync()

  // Once after sign-in: honour ?view=, save a Tavily login handed back in #web-search=<sealed> (the only place the
  // sealed tokens reach the browser), show ?tavily=<outcome>, then clear the URL.
  const urlHandled = useRef(false)
  useEffect(() => {
    if (!user || urlHandled.current) return
    urlHandled.current = true
    const url = new URL(window.location.href)
    const v = url.searchParams.get('view')
    const outcome = url.searchParams.get('tavily')
    const sealed = /^#web-search=([A-Za-z0-9._-]{1,8192})$/.exec(url.hash)?.[1]
    if (!v && !outcome && !url.hash.startsWith('#web-search=')) return
    window.history.replaceState(null, '', url.pathname)
    if (NAV.some((n) => n.name === v)) setView(v as View)
    if (sealed) {
      // Only save a value the server confirms opens for this account (a crafted link must not replace a login).
      verifyTavilyLogin(user, sealed)
        .then(async (ok) => {
          if (!ok) return setConnectorNotice(TAVILY_NOTICES.failed)
          await setConnectorSecret(user.uid, 'web-search', sealed)
          setConnectorNotice({ variant: 'success', text: 'Web search connected' })
        })
        .catch(() => setConnectorNotice({ variant: 'danger', text: "Couldn't save the Web search login. Try again." }))
    } else if (url.hash.startsWith('#web-search=')) {
      setConnectorNotice(TAVILY_NOTICES.failed)
    } else if (outcome) {
      setConnectorNotice(TAVILY_NOTICES[outcome] ?? TAVILY_NOTICES.failed)
    }
  }, [user])

  const tavilyLogin = useCallback(async () => {
    if (!user) return
    window.location.assign(await startTavilyLogin(user))
  }, [user])
  const tavilyDisconnect = useCallback(
    async (sealed?: string) => {
      if (!user) return
      setConnectorNotice(null)
      // Revoking at Tavily is best effort; the saved login is cleared either way.
      if (sealed) await revokeTavilyLogin(user, sealed).catch(() => console.warn('Echo: Tavily revoke failed'))
      await setConnectorSecret(user.uid, 'web-search', null)
    },
    [user],
  )

  const navigate = useCallback((v: View) => {
    setView(v)
    setMore(false)
    // A new page starts at the top (the mobile layout scrolls the document).
    window.scrollTo({ top: 0 })
  }, [])
  const userName = user?.displayName || user?.email?.split('@')[0] || 'You'

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed} days={days} />
      <div className="min-w-0 flex-1">
        <main className={`${view === 'Diary' ? DIARY_MAIN : DEFAULT_MAIN} p-4 md:p-8 max-lg:pb-[calc(var(--tabbar-h)+1.5rem)] md:max-lg:pb-[calc(var(--tabbar-h)+2rem)]`}>
          {/* Diary draws its own full-height mobile header (list / page bar). */}
          {view !== 'Diary' && <MobileTitleBar title={view} />}
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
            <ConnectorsView uid={user.uid} onTavilyLogin={tavilyLogin} onTavilyDisconnect={tavilyDisconnect} notice={connectorNotice} />
          ) : view === '2nd Brain' ? (
            <BrainView uid={user.uid} />
          ) : (
            <SettingsView user={user} profile={profile} signOut={signOut} />
          )}
        </main>
      </div>
      <MobileTabBar view={view} onSelect={navigate} moreOpen={more} onMore={() => setMore(true)} />
      <MoreSheet open={more} onClose={() => setMore(false)} view={view} onSelect={navigate} userName={userName} email={user?.email} days={days} onSignOut={() => void signOut()} />
    </div>
  )
}
