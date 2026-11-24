'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { setConnectorSecret, type UserProfile } from '@/lib/firestore'
import { revokeTavilyLogin, startTavilyLogin, verifyTavilyLogin } from '@/lib/echo/client'
import { currentEmbedMode } from '@/lib/native/float-bridge'
import { getNativePermissions } from '@/lib/native/echo-bridge'
import { autoSyncDue, readLastAutoSync, saveLastAutoSync, syncWeatherLocation } from '@/lib/echo/weather-location'
import { NAV_GROUPS } from '@/lib/echo/sidebar'
import { MOBILE_QUERY } from '@/lib/echo/mobile'
import { Sidebar } from './sidebar'
import { useSidebarData } from './use-sidebar-data'
import { DiaryView } from './diary-view'
import { SettingsView } from './settings'
import { NotesView } from './notes-view'
import { GoalsView } from './goals-view'
import { HealthView } from './health-view'
import { RemindersView } from './reminders-view'
import { ConnectorsView, type ConnectorNotice } from './connectors-view'
import { MusicView } from './music-view'
import { BrainView } from './brain-view'
import { LegacyView } from './legacy/legacy-view'
import { useLegacyActivity } from './legacy/use-legacy-activity'
import { LegacyInboxContext, useLegacyInboxState } from './legacy/use-legacy-inbox'
import { Guide, GuideProvider } from './guide'
import { CheckInsPrompt } from './check-ins-prompt'
import { PermissionSetup } from './permission-setup'
import { MobileTabBar, MobileTitleBar, MoreSheet, type TabView } from './mobile-tabbar'
import { EchoSheet } from './echo-sheet'
import { TodayView } from './today-view'
import { MusicPlayerProvider } from './music-player'
import { useMobileViewportSync } from './use-mobile'

export type View = TabView

const VIEWS: readonly View[] = ['Today', ...NAV_GROUPS.flatMap((g) => g.items), 'Settings']

/** Phones open on the Today tab; the desktop layout opens on the diary (it has its own Today column). */
function firstView(): View {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches ? 'Today' : 'Diary'
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

export function Dashboard({ profile, guideFirst = false }: { profile: UserProfile; guideFirst?: boolean }) {
  const { user, signOut } = useAuth()
  // Read once: the URL handling below clears the query string. Embedded (floating Echo) mode needs the URL and the native bridge.
  const [embed] = useState(currentEmbedMode)
  const [view, setView] = useState<View>(firstView)
  const [collapsed, setCollapsed] = useState(false)
  const [more, setMore] = useState(false)
  const [echoOpen, setEchoOpen] = useState(false)
  // Set by the Echo sheet's "Full call": the diary starts the voice call once today's page is ready.
  const [callRequest, setCallRequest] = useState(false)
  const [guideOpen, setGuideOpen] = useState(guideFirst)
  const [guideStart, setGuideStart] = useState(0)
  const openGuide = useCallback((slide = 0) => {
    setGuideStart(slide)
    setGuideOpen(true)
  }, [])
  const closeGuide = useCallback(() => setGuideOpen(false), [])
  // True while the welcome permission steps are showing or still being worked out.
  const [setupHold, setSetupHold] = useState(true)
  const [pendingPageId, setPendingPageId] = useState<string | null>(null)
  const [focusGoalId, setFocusGoalId] = useState<string | null>(null)
  const [connectorNotice, setConnectorNotice] = useState<ConnectorNotice | null>(null)
  const days = daysWithEcho(profile)
  useLegacyActivity(user?.uid, profile)
  // One watch on the legacies left to this user: the sidebar badge, the home banner and the Legacy page share it.
  const legacyInbox = useLegacyInboxState(embed ? undefined : user?.uid)
  const { dueCount, week, notesCount, goalsPct } = useSidebarData(user?.uid, view)
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
    const goalId = url.searchParams.get('goal')
    if (v === 'Goals' && goalId) setFocusGoalId(goalId.slice(0, 200))
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
    setCallRequest(false) // a call asked for from the Echo sheet only starts on the way there (fullCall sets it after)
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
  const clearCallRequest = useCallback(() => setCallRequest(false), [])
  const fullCall = useCallback(() => {
    setEchoOpen(false)
    navigate('Diary')
    setCallRequest(true)
  }, [navigate])
  const openFromEcho = useCallback(
    (v: View) => {
      setEchoOpen(false)
      navigate(v)
    },
    [navigate],
  )
  const clearFocusGoal = useCallback(() => setFocusGoalId(null), [])
  // Embedded mode has no tab bar: let the stylesheet drop the strip it reserves for one.
  useEffect(() => {
    if (!embed) return
    document.documentElement.dataset.embed = embed
    return () => { delete document.documentElement.dataset.embed }
  }, [embed])
  // Weather follows the phone: on open and on coming back to the app, when location is allowed. At most every 6 hours,
  // since with only approximate location allowed each position request shows Android's "use precise location?" pop-up.
  // (@capacitor/app is not installed, so visibilitychange stands in for the App resume event.)
  const uid = user?.uid
  useEffect(() => {
    if (!uid || embed) return
    let running = false
    const sync = async () => {
      if (running || !autoSyncDue(Date.now(), readLastAutoSync())) return
      running = true
      try {
        const perms = await getNativePermissions() // null on the web or an APK without the permission bridge
        if (!perms?.location || !autoSyncDue(Date.now(), readLastAutoSync())) return
        saveLastAutoSync(Date.now())
        await syncWeatherLocation(uid)
      } finally {
        running = false
      }
    }
    void sync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [uid, embed])
  const userName = user?.displayName || user?.email?.split('@')[0] || 'You'

  if (embed) {
    return <div className="h-dvh bg-background">{user && <DiaryView user={user} profile={profile} onNavigate={navigate} embed={embed} />}</div>
  }

  return (
    // One music player for the whole shell, so it keeps playing across views.
    <MusicPlayerProvider uid={user?.uid}>
    <GuideProvider value={openGuide}>
    <LegacyInboxContext.Provider value={legacyInbox}>
    <div className="flex min-h-screen bg-background">
      <Sidebar view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed} days={days} dueCount={dueCount} legacyCount={legacyInbox.badge} notesCount={notesCount} goalsPct={goalsPct} week={week} onOpenPage={openDiaryPage} />
      <div className="min-w-0 flex-1">
        <main className={`${view === 'Diary' ? DIARY_MAIN : DEFAULT_MAIN} p-4 md:p-8 max-lg:pb-[calc(var(--tabbar-h)+1.5rem)] md:max-lg:pb-[calc(var(--tabbar-h)+2rem)]`}>
          {/* Diary draws its own full-height mobile header (list / page bar); Today shows the greeting as its title. */}
          {view !== 'Diary' && view !== 'Today' && <MobileTitleBar title={view} />}
          {!user ? null : view === 'Diary' ? (
            <DiaryView user={user} profile={profile} onNavigate={navigate} openPageId={pendingPageId} onOpenPageHandled={clearPendingPage} startCall={callRequest} onStartCallHandled={clearCallRequest} />
          ) : view === 'Today' ? (
            <TodayView user={user} profile={profile} onNavigate={navigate} onOpenPage={openDiaryPage} />
          ) : view === 'Notes' ? (
            <NotesView uid={user.uid} user={user} profile={profile} onNavigate={navigate} />
          ) : view === 'Goals' ? (
            <GoalsView uid={user.uid} focusGoalId={focusGoalId} onFocusHandled={clearFocusGoal} />
          ) : view === 'Health' ? (
            <HealthView uid={user.uid} onNavigate={navigate} />
          ) : view === 'Reminders' ? (
            <RemindersView uid={user.uid} user={user} profile={profile} onNavigate={navigate} />
          ) : view === 'Music' ? (
            <MusicView uid={user.uid} />
          ) : view === 'Connectors' ? (
            <ConnectorsView uid={user.uid} onTavilyLogin={tavilyLogin} onTavilyDisconnect={tavilyDisconnect} notice={connectorNotice} />
          ) : view === '2nd Brain' ? (
            <BrainView uid={user.uid} onOpenPage={openDiaryPage} />
          ) : view === 'Legacy' ? (
            <LegacyView user={user} profile={profile} />
          ) : (
            <SettingsView user={user} profile={profile} signOut={signOut} />
          )}
        </main>
      </div>
      <MobileTabBar view={view} onSelect={navigate} moreOpen={more} onMore={() => setMore(true)} echoOpen={echoOpen} onEcho={() => setEchoOpen(true)} />
      <MoreSheet open={more} onClose={() => setMore(false)} view={view} onSelect={navigate} userName={userName} email={user?.email} days={days} />
      {user && <EchoSheet open={echoOpen} onClose={() => setEchoOpen(false)} user={user} profile={profile} onNavigate={openFromEcho} onFullCall={fullCall} />}
      <Guide open={guideOpen} start={guideStart} onClose={closeGuide} />
      {/* The steps wait for the guide; the check-in question waits for both. */}
      {user && <PermissionSetup uid={user.uid} onboarded={profile.onboarded} embed={false} paused={guideOpen} onHoldChange={setSetupHold} />}
      {user && <CheckInsPrompt uid={user.uid} onboarded={profile.onboarded} paused={guideOpen || setupHold} />}
    </div>
    </LegacyInboxContext.Provider>
    </GuideProvider>
    </MusicPlayerProvider>
  )
}
