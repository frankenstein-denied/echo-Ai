'use client'

import { X } from 'lucide-react'
import { ownerDisplayName } from '@/lib/echo/legacy-chat-helpers'
import { Button, IconButton } from '../ui'
import { useLegacyInbox } from './use-legacy-inbox'

/** One-time home notice that a legacy left to this user has opened. Opening or dismissing marks it seen. */
export function LegacyReleaseBanner({ onOpen }: { onOpen: () => void }) {
  const inbox = useLegacyInbox()
  if (!inbox?.links || !inbox.releaseChecked) return null
  const link = inbox.links.find((l) => l.status === 'accepted' && inbox.released.includes(l.ownerUid) && !inbox.seen.includes(l.ownerUid))
  if (!link) return null
  const name = ownerDisplayName(null, link.ownerName)

  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3" style={{ boxShadow: '0 0 18px -8px #f0a6c9' }}>
      <span aria-hidden="true" className="text-2xl leading-none">
        🕯️
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{name}&apos;s legacy is open to you.</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{name} left memories for you. Answer {name}&apos;s question to open them.</p>
        <div className="mt-2">
          <Button
            size="sm"
            onClick={() => {
              inbox.markSeen(link.ownerUid)
              inbox.requestOpen(link.ownerUid)
              onOpen()
            }}
          >
            Open
          </Button>
        </div>
      </div>
      <IconButton icon={X} size="sm" label="Dismiss" onClick={() => inbox.markSeen(link.ownerUid)} />
    </div>
  )
}
