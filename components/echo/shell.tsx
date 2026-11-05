'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { setConnectorSecret, type UserProfile } from '@/lib/firestore'
import { revokeTavilyLogin, startTavilyLogin, verifyTavilyLogin } from '@/lib/echo/client'
import { NAV_GROUPS, type NavName } from '@/lib/echo/sidebar'
import { Sidebar } from './sidebar'
import { useSidebarData } from './use-sidebar-data'
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

export type View = NavName

const VIEWS: readonly View[] = [...NAV_GROUPS.flatMap((g) => g.items), 'Settings']

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
  const [pendingPageId, setPendingPageId] = useState<string | null>(null)
  const [connectorNotice, setConnectorNotice] = useState<ConnectorNotice | null>(null)
  const days = daysWithEcho(profile)
  const { dueCount, week } = useSidebarData(user?.uid)
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
    if (VIEWS.includes(v as View)) setView(v as View)
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
  const openDiaryPage = useCallback(
    (pageId: string) => {
      setPendingPageId(pageId)
      navigate('Diary')
    },
    [navigate],
  )
  const clearPendingPage = useCallback(() => setPendingPageId(null), [])
  const userName = user?.displayName || user?.email?.split('@')[0] || 'You'

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed} days={days} dueCount={dueCount} week={week} onOpenPage={openDiaryPage} />
      <div className="min-w-0 flex-1">
        <main className={`${view === 'Diary' ? DIARY_MAIN : DEFAULT_MAIN} p-4 md:p-8 max-lg:pb-[calc(var(--tabbar-h)+1.5rem)] md:max-lg:pb-[calc(var(--tabbar-h)+2rem)]`}>
          {/* Diary draws its own full-height mobile header (list / page bar). */}
          {view !== 'Diary' && <MobileTitleBar title={view} />}
          {!user ? null : view === 'Diary' ? (
            <DiaryView user={user} profile={profile} onNavigate={navigate} openPageId={pendingPageId} onOpenPageHandled={clearPendingPage} />
          ) : view === 'Notes' ? (
            <NotesView uid={user.uid} />
          ) : view === 'Goals' ? (
            <GoalsView uid={user.uid} />
          ) : view === 'Health' ? (
            <HealthView uid={user.uid} onNavigate={navigate} />
          ) : view === 'Reminders' ? (
            <RemindersView uid={user.uid} />
          ) : view === 'Connectors' ? (
            <ConnectorsView uid={user.uid} onTavilyLogin={tavilyLogin} onTavilyDisconnect={tavilyDisconnect} notice={connectorNotice} />
          ) : view === '2nd Brain' ? (
            <BrainView uid={user.uid} onOpenPage={openDiaryPage} />
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
