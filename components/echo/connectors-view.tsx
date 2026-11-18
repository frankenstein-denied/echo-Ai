'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { Search } from 'lucide-react'
import { connectorsCol, setConnectorConnected } from '@/lib/firestore'
import { connectedSummary } from '@/lib/echo/connector-tiles'
import { categoryChips, emptyMessage, filterConnectors, groupByCategory, shownCountText, type CategoryFilter } from '@/lib/echo/connector-filter'
import { AI_PROVIDERS, CONNECTORS, connectorStatuses, type AiProvider, type ConnectorDef, type ConnectorId, type ConnectorStatus } from '@/lib/echo/connectors'
import { Alert, Button, EmptyState, PageHeader, Skeleton } from './ui'
import { ConnectorCard } from './connectors/connector-card'
import { ConnectorFilters } from './connectors/connector-filters'
import { WeatherBody, WeatherLive } from './connectors/weather-card'
import { AiKeyBody } from './connectors/ai-key-card'

export type ConnectorNotice = { variant: 'success' | 'warning' | 'danger'; text: string }

type ConnectorDoc = { id: string; connected?: boolean; sealed?: string; place?: string; lat?: number; lon?: number }

const CHIPS = categoryChips(CONNECTORS)
// Every section and card stays mounted; filtering only hides them, so Weather keeps its forecast and picker state.
const ALL_GROUPS = groupByCategory(CONNECTORS)

export function ConnectorsView({
  uid,
  onTavilyLogin,
  onTavilyDisconnect,
  notice,
}: {
  uid: string
  onTavilyLogin?: () => Promise<void>
  /** Revokes and clears the Web search login; gets the saved sealed tokens when there are any. */
  onTavilyDisconnect?: (sealed?: string) => Promise<void>
  notice?: ConnectorNotice | null
}) {
  const [docs, setDocs] = useState<ConnectorDoc[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState<ConnectorId | null>(null)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return onSnapshot(
      connectorsCol(uid),
      (snap) => {
        setDocs(snap.docs.map((s) => ({ id: s.id, connected: s.data().connected, sealed: s.data().sealed, place: s.data().place, lat: s.data().lat, lon: s.data().lon })))
        setLoadError('')
      },
      (e) => {
        setDocs([])
        setLoadError(e.message || 'Could not load your connectors.')
      },
    )
  }, [uid])

  const statuses = useMemo(() => (docs ? connectorStatuses(docs) : []), [docs])
  const visible = useMemo(() => new Set(filterConnectors(CONNECTORS, { category, query }).map((c) => c.id)), [category, query])

  async function run(id: ConnectorId, action: () => Promise<void>) {
    setBusy(id)
    setActionError('')
    try {
      await action()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update the connector.')
    } finally {
      setBusy(null)
    }
  }
  const toggle = (id: ConnectorId, name: string, connected: boolean) => run(id, () => setConnectorConnected(uid, id, name, connected))
  const statusOf = (id: ConnectorId): ConnectorStatus => statuses.find((s) => s.id === id)?.status ?? 'coming_soon'
  const docOf = (id: ConnectorId) => docs?.find((d) => d.id === id)
  // News and Movies need a server API key; until it is set they show "Needs setup", never "Ready".
  const [serverKeys, setServerKeys] = useState<{ news?: boolean; movies?: boolean } | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/connectors/config')
      .then((r) => r.json())
      .then((d) => live && setServerKeys(d))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  const needsSetup = (id: ConnectorId) => (id === 'news' || id === 'movies') && serverKeys !== null && !serverKeys[id]

  /** Live data and actions inside one card. Connect flows are unchanged from the single-grid page. */
  function body(c: ConnectorDef, status: ConnectorStatus) {
    if (status === 'coming_soon') return null
    if ((AI_PROVIDERS as readonly string[]).includes(c.id)) return <AiKeyBody uid={uid} provider={c.id as AiProvider} name={c.name} connected={status === 'connected'} />
    if (needsSetup(c.id))
      return (
        <>
          <p className="mt-4 text-lg font-semibold text-foreground">Needs setup</p>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">{c.description} Not available yet: the server's API key isn't set. Echo uses web search for these questions meanwhile.</p>
        </>
      )
    const connected = status === 'connected'
    const weatherDoc = docOf('weather')
    return (
      <>
        {connected && c.id === 'weather' && <WeatherLive place={weatherDoc?.place} lat={weatherDoc?.lat} lon={weatherDoc?.lon} />}
        {connected && c.id !== 'weather' && (
          <>
            <p className="mt-4 text-lg font-semibold text-foreground">Ready</p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{c.description}</p>
          </>
        )}
        {!connected && <p className="mt-3 flex-1 text-sm text-muted-foreground">{c.description}</p>}
        {c.kind === 'builtin' && c.id !== 'weather' ? (
          <Button variant={connected ? 'secondary' : 'primary'} loading={busy === c.id} onClick={() => toggle(c.id, c.name, !connected)} className="mt-4 w-full">
            {connected ? 'Disconnect' : 'Connect'}
          </Button>
        ) : c.id === 'web-search' ? (
          connected ? (
            <Button variant="secondary" loading={busy === c.id} disabled={!onTavilyDisconnect} onClick={() => onTavilyDisconnect && run(c.id, () => onTavilyDisconnect(docOf('web-search')?.sealed))} className="mt-4 w-full">
              Disconnect
            </Button>
          ) : (
            <>
              <Button variant="primary" loading={busy === c.id} disabled={!onTavilyLogin} onClick={() => onTavilyLogin && run(c.id, onTavilyLogin)} className="mt-4 w-full">
                Log in with Tavily
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">Opens Tavily&apos;s login. Searches use your own Tavily account (free: 1,000 a month).</p>
            </>
          )
        ) : c.id === 'weather' ? (
          <WeatherBody uid={uid} connected={connected} place={weatherDoc?.place} showPlace={false} />
        ) : null}
      </>
    )
  }

  return (
    <div className="animate-in">
      <PageHeader title="Connectors" description="Link the tools Echo can learn from and act on." />
      {(loadError || actionError) && (
        <div className="mb-4">
          <Alert variant="danger">{loadError || actionError}</Alert>
        </div>
      )}
      {notice && !loadError && !actionError && (
        <div className="mb-4">
          <Alert variant={notice.variant}>{notice.text}</Alert>
        </div>
      )}
      {docs === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : (
        <>
          <p className="-mt-3 mb-4 text-sm text-muted-foreground">{connectedSummary(statuses)}</p>
          <ConnectorFilters chips={CHIPS} category={category} onCategory={setCategory} query={query} onQuery={setQuery} inputRef={searchRef} />
          <p role="status" className="sr-only">
            {shownCountText(visible.size)}
          </p>
          {visible.size === 0 && (
            <EmptyState
              icon={Search}
              title="Nothing matches"
              description={emptyMessage({ category, query })}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCategory('all')
                    setQuery('')
                    searchRef.current?.focus()
                  }}
                >
                  Clear
                </Button>
              }
            />
          )}
          <div className="grid gap-6">
            {ALL_GROUPS.map((g) => (
              <section key={g.id} aria-labelledby={`connectors-${g.id}`} hidden={!g.items.some((c) => visible.has(c.id))}>
                <h2 id={`connectors-${g.id}`} className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((c) => {
                    const status = needsSetup(c.id) ? 'not_connected' : statusOf(c.id)
                    return (
                      <div key={c.id} className="grid" hidden={!visible.has(c.id)}>
                        <ConnectorCard def={c} status={status}>
                          {body(c, status)}
                        </ConnectorCard>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
