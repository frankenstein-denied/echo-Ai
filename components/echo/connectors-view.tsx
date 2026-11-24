'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { Search } from 'lucide-react'
import { connectorsCol, disconnectWeather, setConnectorConnected } from '@/lib/firestore'
import { categoryChips, emptyMessage, filterConnectors, shownCountText, type CategoryFilter } from '@/lib/echo/connector-filter'
import { connectorExample, connectorSections, connectorsLine, needsYou } from '@/lib/echo/connector-examples'
import { AI_PROVIDERS, CONNECTORS, connectorStatuses, type AiProvider, type ConnectorDef, type ConnectorId, type ConnectorStatus } from '@/lib/echo/connectors'
import { Alert, Button, EmptyState, IconButton, PageHeader, Skeleton, Switch } from './ui'
import { ConnectorRow } from './connectors/connector-card'
import { ConnectorFilters } from './connectors/connector-filters'
import { WeatherBody, WeatherLine } from './connectors/weather-card'
import { AiKeyBody } from './connectors/ai-key-card'

export type ConnectorNotice = { variant: 'success' | 'warning' | 'danger'; text: string }

type ConnectorDoc = { id: string; connected?: boolean; sealed?: string; place?: string; lat?: number; lon?: number }
type Row = { def: ConnectorDef; id: ConnectorId; status: ConnectorStatus; needsYou: boolean; setup: boolean }

const CHIPS = categoryChips(CONNECTORS)
const isAi = (id: ConnectorId) => (AI_PROVIDERS as readonly string[]).includes(id)
const shortName = (name: string) => name.replace(/ \(.*\)$/, '')

/** What a connector that needs the user is waiting for. */
function needsLine(id: ConnectorId): string {
  if (id === 'web-search') return 'Sign in once to search the web'
  if (id === 'weather') return 'Pick your place to see the weather'
  return isAi(id) ? 'Add your key to finish' : 'Finish setting it up'
}

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
  const [searchOpen, setSearchOpen] = useState(false)
  const [open, setOpen] = useState<Set<ConnectorId>>(() => new Set())
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

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  // News and Movies need a server API key; until it is set they show "Not available yet", never "On".
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
  const docOf = (id: ConnectorId) => docs?.find((d) => d.id === id)
  const rows: Row[] = useMemo(() => {
    if (!docs) return []
    const statuses = connectorStatuses(docs)
    return CONNECTORS.map((def) => {
      const setup = (def.id === 'news' || def.id === 'movies') && serverKeys !== null && !serverKeys[def.id]
      const raw = statuses.find((s) => s.id === def.id)?.status ?? 'coming_soon'
      const status: ConnectorStatus = setup ? 'not_connected' : raw
      return { def, id: def.id, status, setup, needsYou: !setup && needsYou(def.id, docs.find((d) => d.id === def.id), status) }
    })
  }, [docs, serverKeys])
  const shownIds = useMemo(() => new Set(filterConnectors(CONNECTORS, { category, query }).map((c) => c.id)), [category, query])
  const sections = useMemo(() => connectorSections(rows.filter((r) => shownIds.has(r.id))), [rows, shownIds])
  const shownCount = sections.reduce((n, s) => n + s.items.length, 0)

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
  const toggleOpen = (id: ConnectorId, to?: boolean) =>
    setOpen((s) => {
      const next = new Set(s)
      if (to ?? !next.has(id)) next.add(id)
      else next.delete(id)
      return next
    })
  const tavilyLogin = () => onTavilyLogin && run('web-search', onTavilyLogin)
  const tavilyLogout = () => onTavilyDisconnect && run('web-search', () => onTavilyDisconnect(docOf('web-search')?.sealed))

  /** The line under the name: what's missing, live weather, or an example of what to ask Echo. */
  function line(r: Row) {
    if (r.status === 'coming_soon') return r.def.description
    if (r.setup) return 'Not available yet'
    if (r.needsYou) return needsLine(r.id)
    if (r.status === 'connected' && r.id === 'weather') {
      const w = docOf('weather')
      return <WeatherLine place={w?.place} lat={w?.lat} lon={w?.lon} />
    }
    return connectorExample(r.id) ?? r.def.description
  }

  /** The quick control on the right of the row. Everything else opens with the row. */
  function control(r: Row) {
    const connected = r.status === 'connected'
    const label = `${shortName(r.def.name)} ${connected ? 'on' : 'off'}`
    if (r.setup) return null
    if (r.def.kind === 'builtin' && r.id !== 'weather') return <Switch checked={connected} onChange={(v) => void toggle(r.id, r.def.name, v)} label={label} disabled={busy === r.id} />
    if (r.id === 'weather')
      return connected ? (
        <Switch checked onChange={() => void run('weather', () => disconnectWeather(uid))} label={label} disabled={busy === r.id} />
      ) : (
        <Button size="sm" variant={r.needsYou ? 'primary' : 'secondary'} onClick={() => toggleOpen(r.id, true)}>
          Set up
        </Button>
      )
    if (r.id === 'web-search')
      return connected ? (
        <Switch checked onChange={() => void tavilyLogout()} label={label} disabled={busy === r.id || !onTavilyDisconnect} />
      ) : (
        <Button size="sm" variant={r.needsYou ? 'primary' : 'secondary'} loading={busy === r.id} disabled={!onTavilyLogin} onClick={() => void tavilyLogin()}>
          Connect
        </Button>
      )
    if (isAi(r.id) && !connected)
      return (
        <Button size="sm" variant={r.needsYou ? 'primary' : 'secondary'} onClick={() => toggleOpen(r.id, true)}>
          Add key
        </Button>
      )
    return null
  }

  /** The details under an opened row: the existing connect flows. */
  function body(r: Row) {
    const c = r.def
    const connected = r.status === 'connected'
    const example = connectorExample(c.id)
    if (r.status === 'coming_soon') return null
    const about = (
      <>
        <p className="mt-3 text-sm text-muted-foreground">{c.description}</p>
        {example && !r.setup && <p className="mt-1 text-sm text-foreground">{example}</p>}
      </>
    )
    if (isAi(c.id))
      return (
        <>
          {about}
          <AiKeyBody uid={uid} provider={c.id as AiProvider} name={c.name} connected={connected} />
        </>
      )
    if (r.setup)
      return (
        <>
          {about}
          <p className="mt-2 text-sm text-muted-foreground">Not available yet: the server&apos;s API key isn&apos;t set. Echo uses web search for these questions meanwhile.</p>
        </>
      )
    if (c.id === 'weather') {
      const w = docOf('weather')
      return (
        <>
          {about}
          <WeatherBody uid={uid} connected={connected} place={w?.place} />
        </>
      )
    }
    if (c.id === 'web-search')
      return (
        <>
          {about}
          {connected ? (
            <Button variant="secondary" loading={busy === c.id} disabled={!onTavilyDisconnect} onClick={() => void tavilyLogout()} className="mt-4 w-full">
              Disconnect
            </Button>
          ) : (
            <>
              <Button variant="primary" loading={busy === c.id} disabled={!onTavilyLogin} onClick={() => void tavilyLogin()} className="mt-4 w-full">
                Log in with Tavily
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">Opens Tavily&apos;s login. Searches use your own Tavily account (free: 1,000 a month).</p>
            </>
          )}
        </>
      )
    return about
  }

  return (
    <div className="animate-in mx-auto max-w-3xl">
      <PageHeader
        title="Connectors"
        line={docs ? connectorsLine(rows) : 'Tools Echo can use for you'}
        actions={<IconButton icon={Search} label={searchOpen ? 'Hide search' : 'Search connectors'} aria-pressed={searchOpen} onClick={() => setSearchOpen((o) => !o)} />}
      />
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
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <>
          <ConnectorFilters chips={CHIPS} category={category} onCategory={setCategory} query={query} onQuery={setQuery} inputRef={searchRef} showSearch={searchOpen} />
          <p role="status" className="sr-only">
            {shownCountText(shownCount)}
          </p>
          {shownCount === 0 && (
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
                  }}
                >
                  Clear
                </Button>
              }
            />
          )}
          <div className="grid gap-5">
            {sections.map((sec) => (
              <section key={sec.id} aria-labelledby={`connectors-${sec.id}`}>
                <h2 id={`connectors-${sec.id}`} className={`mb-2 text-xs font-semibold uppercase tracking-wider ${sec.id === 'needs' ? 'text-warning' : 'text-muted-foreground'}`}>
                  {sec.label}
                </h2>
                <div className="grid gap-2">
                  {sec.items.map((r) => (
                    <ConnectorRow key={r.id} def={r.def} status={r.status} needsYou={r.needsYou} line={line(r)} control={control(r)} open={open.has(r.id)} onToggle={() => toggleOpen(r.id)}>
                      {body(r)}
                    </ConnectorRow>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
