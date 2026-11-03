'use client'

import { useEffect, useMemo, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { Apple, Calendar, CloudSun, FileText, GitBranch, Globe, Mail, Music, Plug, type LucideIcon } from 'lucide-react'
import { connectorsCol, disconnectWeather, setConnectorConnected, setWeatherLocation } from '@/lib/firestore'
import { searchPlaces, type Place } from '@/lib/echo/weather'
import { CONNECTORS, connectorStatuses, type ConnectorId, type ConnectorStatus } from '@/lib/echo/connectors'
import { Alert, Badge, Button, Card, Input, PageHeader, Skeleton } from './ui'

const ICONS: Record<ConnectorId, LucideIcon> = {
  nutrition: Apple,
  'web-search': Globe,
  weather: CloudSun,
  spotify: Music,
  'google-calendar': Calendar,
  gmail: Mail,
  github: GitBranch,
  notion: FileText,
}

const BADGES: Record<ConnectorStatus, { label: string; variant: 'success' | 'neutral' }> = {
  connected: { label: 'Connected', variant: 'success' },
  not_connected: { label: 'Not connected', variant: 'neutral' },
  coming_soon: { label: 'Coming soon', variant: 'neutral' },
}

export type ConnectorNotice = { variant: 'success' | 'warning' | 'danger'; text: string }

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
  const [docs, setDocs] = useState<{ id: string; connected?: boolean; sealed?: string; place?: string; lat?: number; lon?: number }[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState<ConnectorId | null>(null)

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
  const webSealed = docs?.find((d) => d.id === 'web-search')?.sealed
  const weatherPlace = docs?.find((d) => d.id === 'weather')?.place

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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CONNECTORS.map((c) => {
            const status = statuses.find((s) => s.id === c.id)?.status ?? 'coming_soon'
            const badge = BADGES[status]
            const Icon = ICONS[c.id] ?? Plug
            return (
              <Card key={c.id} className="flex flex-col">
                <div className="flex items-start justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-surface-2 text-muted-foreground">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <h2 className="mt-4 text-base font-semibold text-foreground">{c.name}</h2>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{c.description}</p>
                {c.id === 'nutrition' ? (
                  <Button variant={status === 'connected' ? 'secondary' : 'primary'} loading={busy === c.id} onClick={() => toggle(c.id, c.name, status !== 'connected')} className="mt-4 w-full">
                    {status === 'connected' ? 'Disconnect' : 'Connect'}
                  </Button>
                ) : c.id === 'web-search' ? (
                  status === 'connected' ? (
                    <Button variant="secondary" loading={busy === c.id} disabled={!onTavilyDisconnect} onClick={() => onTavilyDisconnect && run(c.id, () => onTavilyDisconnect(webSealed))} className="mt-4 w-full">
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
                  <WeatherBody uid={uid} connected={status === 'connected'} place={weatherPlace} />
                ) : (
                  <Button variant="secondary" disabled className="mt-4 w-full">
                    Coming soon
                  </Button>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function geoMessage(code: number | undefined): string {
  if (code === 1) return 'Location access was blocked. Search for your city instead.'
  if (code === 3) return 'Finding your location took too long. Search for your city instead.'
  return 'Could not find your location. Search for your city instead.'
}

/** Weather card body: pick a location (browser geolocation or city search), or show and change/disconnect the saved one. */
function WeatherBody({ uid, connected, place }: { uid: string; connected: boolean; place?: string }) {
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [changing, setChanging] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [message, setMessage] = useState('')

  async function save(loc: { place: string; lat: number; lon: number }) {
    try {
      await setWeatherLocation(uid, loc)
      setChanging(false)
      setResults(null)
      setQuery('')
      setMessage('')
    } catch {
      setMessage('Could not save your location. Please try again.')
    }
  }

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMessage('Your browser can not share a location. Search for your city instead.')
      return
    }
    setBusy(true)
    setLocating(true)
    setMessage('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void save({ place: 'Your location', lat: pos.coords.latitude, lon: pos.coords.longitude }).finally(() => {
          setBusy(false)
          setLocating(false)
        })
      },
      (err) => {
        setMessage(geoMessage(err?.code))
        setBusy(false)
        setLocating(false)
      },
      { timeout: 10000, maximumAge: 600000 },
    )
  }

  async function search() {
    if (!query.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const found = await searchPlaces(query)
      setResults(found.slice(0, 5))
      if (found.length === 0) setMessage('No places found. Try another spelling.')
    } catch {
      setResults(null)
      setMessage('Could not search right now. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setMessage('')
    try {
      await disconnectWeather(uid)
      setChanging(false)
    } catch {
      setMessage('Could not disconnect. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const picking = !connected || changing
  return (
    <div className="mt-4 space-y-3">
      {connected && (
        <p className="text-sm text-foreground">
          Showing weather for <span className="font-medium">{place || 'your location'}</span>
        </p>
      )}
      {picking ? (
        <>
          <Button variant="primary" loading={locating} disabled={busy} onClick={useMyLocation} className="w-full">
            Use my location
          </Button>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void search()
            }}
          >
            <div className="min-w-0 flex-1">
              <Input label="Or search for a city" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Manila" maxLength={100} />
            </div>
            <Button type="submit" variant="secondary" disabled={busy || !query.trim()} className="w-full sm:w-auto">
              Search
            </Button>
          </form>
          {results && results.length > 0 && (
            <ul className="space-y-1" aria-label="Search results">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true)
                      void save({ place: r.detail ? `${r.name}, ${r.detail}` : r.name, lat: r.lat, lon: r.lon }).finally(() => setBusy(false))
                    }}
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2 disabled:opacity-50 max-lg:min-h-11"
                  >
                    {r.name}
                    {r.detail ? ` — ${r.detail}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {changing && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setChanging(false)} className="w-full">
              Cancel
            </Button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" disabled={busy} onClick={() => setChanging(true)} className="w-full sm:flex-1">
            Change location
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => void disconnect()} className="w-full sm:flex-1">
            Disconnect
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  )
}
