'use client'

import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { Calendar, CloudSun, FileText, GitBranch, Mail, Music, Plug, type LucideIcon } from 'lucide-react'
import { connectorsCol, type Connector } from '@/lib/firestore'
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Skeleton } from './ui'

type ConnectorRow = Connector & { id: string }

const PROVIDERS: Record<string, { icon: LucideIcon; description: string }> = {
  'google-calendar': { icon: Calendar, description: 'Read and create events.' },
  gmail: { icon: Mail, description: 'Summarize and draft emails.' },
  github: { icon: GitBranch, description: 'Read activity and commits.' },
  notion: { icon: FileText, description: 'Read and create pages.' },
  spotify: { icon: Music, description: 'Understand listening patterns.' },
  weather: { icon: CloudSun, description: 'Local conditions via Open-Meteo.' },
}

export function ConnectorsView({ uid }: { uid: string }) {
  const [rows, setRows] = useState<ConnectorRow[] | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    return onSnapshot(
      connectorsCol(uid),
      (snap) => {
        setRows(snap.docs.map((s) => ({ ...s.data({ serverTimestamps: 'estimate' }), id: s.id })))
        setLoadError('')
      },
      (e) => {
        setRows([])
        setLoadError(e.message || 'Could not load your connectors.')
      },
    )
  }, [uid])

  return (
    <div className="animate-in">
      <PageHeader title="Connectors" description="Link the tools Echo can learn from and act on." />
      {loadError && (
        <div className="mb-4">
          <Alert variant="danger">{loadError}</Alert>
        </div>
      )}
      {rows === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Plug} title="No connectors yet" description="Connectors appear here once your account is set up." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const p = PROVIDERS[c.id]
            const Icon = p?.icon ?? Plug
            return (
              <Card key={c.id} className="flex flex-col">
                <div className="flex items-start justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-surface-2 text-muted-foreground">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <Badge variant={c.connected ? 'success' : 'neutral'}>{c.connected ? 'Connected' : 'Not connected'}</Badge>
                </div>
                <h2 className="mt-4 text-base font-semibold text-foreground">{c.name}</h2>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{p?.description ?? 'Integration with Echo.'}</p>
                <Button variant="secondary" disabled className="mt-4 w-full">
                  Coming soon
                </Button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
