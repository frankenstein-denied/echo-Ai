'use client'

import { useEffect, useMemo, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { Apple, Calendar, CloudSun, FileText, GitBranch, Globe, Mail, Music, Plug, type LucideIcon } from 'lucide-react'
import { connectorsCol, setConnectorConnected } from '@/lib/firestore'
import { CONNECTORS, connectorStatuses, type ConnectorId, type ConnectorStatus } from '@/lib/echo/connectors'
import { Alert, Badge, Button, Card, PageHeader, Skeleton } from './ui'

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

export function ConnectorsView({ uid, onTavilyLogin }: { uid: string; onTavilyLogin?: () => void }) {
  const [docs, setDocs] = useState<{ id: string; connected?: boolean }[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    return onSnapshot(
      connectorsCol(uid),
      (snap) => {
        setDocs(snap.docs.map((s) => ({ id: s.id, connected: s.data().connected })))
        setLoadError('')
      },
      (e) => {
        setDocs([])
        setLoadError(e.message || 'Could not load your connectors.')
      },
    )
  }, [uid])

  const statuses = useMemo(() => (docs ? connectorStatuses(docs) : []), [docs])

  async function toggle(id: ConnectorId, name: string, connected: boolean) {
    setBusy(true)
    setActionError('')
    try {
      await setConnectorConnected(uid, id, name, connected)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update the connector.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-in">
      <PageHeader title="Connectors" description="Link the tools Echo can learn from and act on." />
      {(loadError || actionError) && (
        <div className="mb-4">
          <Alert variant="danger">{loadError || actionError}</Alert>
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
                  <Button variant={status === 'connected' ? 'secondary' : 'primary'} loading={busy} onClick={() => toggle(c.id, c.name, status !== 'connected')} className="mt-4 w-full">
                    {status === 'connected' ? 'Disconnect' : 'Connect'}
                  </Button>
                ) : c.id === 'web-search' ? (
                  <Button variant="primary" disabled={!onTavilyLogin} onClick={onTavilyLogin} className="mt-4 w-full">
                    Log in with Tavily
                  </Button>
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
