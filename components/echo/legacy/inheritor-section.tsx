'use client'

import { useEffect, useState } from 'react'
import { getDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { LogOut } from 'lucide-react'
import type { UserProfile } from '@/lib/firestore'
import type { LegacyKind } from '@/lib/echo/legacy'
import { initialOf, ownerDisplayName, RELOCKED_MESSAGE } from '@/lib/echo/legacy-chat-helpers'
import { isReleased, leaveLegacy, legacyProfileDoc, loadSharedLegacy, respondToRequest, type LegacyLink, type SharedLegacy } from '@/lib/legacy-store'
import { Alert, Badge, Button, Card, ConfirmDialog, IconButton, Skeleton } from '../ui'
import { MemorialChat } from './memorial-chat'
import { UnlockScreen } from './unlock-screen'
import { useLegacyInbox, useLegacyInboxState, type LegacyInbox } from './use-legacy-inbox'

export type InheritorSectionProps = { user: User; profile: UserProfile; onOpen?: (link: LegacyLink) => void }

const linkName = (link: LegacyLink) => ownerDisplayName(null, link.ownerName)

/** The shell's inbox, or a local one when rendered outside the shell. */
export function useInbox(uid: string): LegacyInbox {
  const shared = useLegacyInbox()
  const local = useLegacyInboxState(shared ? undefined : uid)
  return shared ?? local
}

function Initial({ name }: { name: string }) {
  return (
    <div
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-foreground"
      style={{ background: 'color-mix(in srgb, #f0a6c9 30%, var(--color-surface-2))' }}
    >
      {initialOf(name)}
    </div>
  )
}

function RequestRow({ link }: { link: LegacyLink }) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState('')
  const name = linkName(link)

  async function respond(accept: boolean) {
    setBusy(accept ? 'accept' : 'decline')
    setError('')
    try {
      await respondToRequest(link.id, accept)
    } catch {
      setError("Couldn't save your answer. Try again.")
      setBusy(null)
    }
  }

  return (
    <li className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-start gap-3">
        <Initial name={name} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{name} wants you as an inheritor of their Echo.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            If {name} stops using Echo for a while, you&apos;ll be able to open their memories and talk with their Echo.
          </p>
          {error && (
            <div className="mt-2">
              <Alert variant="danger">{error}</Alert>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" loading={busy === 'accept'} disabled={busy !== null} onClick={() => void respond(true)}>
              Accept
            </Button>
            <Button size="sm" variant="secondary" loading={busy === 'decline'} disabled={busy !== null} onClick={() => void respond(false)}>
              Decline
            </Button>
          </div>
        </div>
      </div>
    </li>
  )
}

function LegacyRow({ link, state, onOpen, onLeave }: { link: LegacyLink; state: 'checking' | 'locked' | 'released'; onOpen: () => void; onLeave: () => void }) {
  const name = linkName(link)
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
      <Initial name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <div className="mt-1">
          {state === 'checking' ? (
            <Skeleton className="h-5 w-32" />
          ) : state === 'released' ? (
            <Badge variant="success">🔓 Released</Badge>
          ) : (
            <Badge variant="neutral">🔒 Locked · {name} is active</Badge>
          )}
        </div>
      </div>
      {state === 'released' && (
        <Button size="sm" onClick={onOpen}>
          Answer question to open
        </Button>
      )}
      <IconButton icon={LogOut} size="sm" label={`Leave ${name}'s legacy`} onClick={onLeave} />
    </li>
  )
}

/** The inheritor's side of Legacy: requests to accept, and the legacies left to this user. */
export default function InheritorSection({ user, onOpen }: InheritorSectionProps) {
  const inbox = useInbox(user.uid)
  const [leaving, setLeaving] = useState<LegacyLink | null>(null)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const links = inbox.links
  const requests = (links ?? []).filter((l) => l.status === 'pending')
  const accepted = (links ?? []).filter((l) => l.status === 'accepted')

  async function confirmLeave() {
    if (!leaving) return
    setLeaveBusy(true)
    setLeaveError(null)
    try {
      await leaveLegacy(leaving.id)
      setLeaving(null)
    } catch {
      setLeaveError("Couldn't leave right now. Try again.")
    } finally {
      setLeaveBusy(false)
    }
  }

  return (
    <div className="grid gap-5">
      {requests.length > 0 && (
        <Card>
          <h2 className="text-base font-semibold text-foreground">Requests</h2>
          <ul className="mt-4 grid gap-2">
            {requests.map((l) => (
              <RequestRow key={l.id} link={l} />
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="text-base font-semibold text-foreground">Legacies left to you</h2>
        {inbox.error && (
          <div className="mt-3">
            <Alert variant="danger">{inbox.error}</Alert>
          </div>
        )}
        {links === null ? (
          <div className="mt-4">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : accepted.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">When someone names you in their legacy and you accept, it shows up here.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {accepted.map((l) => (
              <LegacyRow
                key={l.id}
                link={l}
                state={!inbox.releaseChecked ? 'checking' : inbox.released.includes(l.ownerUid) ? 'released' : 'locked'}
                onOpen={() => onOpen?.(l)}
                onLeave={() => {
                  setLeaveError(null)
                  setLeaving(l)
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      {leaving && (
        <ConfirmDialog
          title={`Leave ${linkName(leaving)}'s legacy?`}
          body={`You won't be able to open it. ${linkName(leaving)} would have to add you again.`}
          confirmLabel="Leave"
          busy={leaveBusy}
          error={leaveError}
          onCancel={() => setLeaving(null)}
          onConfirm={() => void confirmLeave()}
        />
      )}
    </div>
  )
}

function isDenied(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'permission-denied'
}

type OpenState = { step: 'checking' } | { step: 'closed'; relocked?: boolean } | { step: 'question' } | { step: 'loading' } | { step: 'chat'; shared: SharedLegacy } | { step: 'error' }

/** Opening a released legacy: the question first (unless already answered), then the memorial chat. */
export function OpenLegacy({ user, profile, link, onBack }: { user: User; profile: UserProfile; link: LegacyLink; onBack: () => void }) {
  const [state, setState] = useState<OpenState>({ step: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const ownerUid = link.ownerUid
  // Compared by value, so a fresh snapshot of the same link doesn't reload.
  const sharedKey = link.shared.join(',')
  const inheritorName = profile.preferredName?.trim() || profile.displayName?.trim() || user.displayName?.trim() || ''

  useEffect(() => {
    let cancelled = false
    const set = (s: OpenState) => !cancelled && setState(s)
    ;(async () => {
      set({ step: 'checking' })
      try {
        if (!(await isReleased(ownerUid))) return set({ step: 'closed' })
        try {
          // The profile copy is readable only once the right answer is stored.
          await getDoc(legacyProfileDoc(ownerUid))
        } catch (e) {
          if (isDenied(e)) return set({ step: 'question' })
          throw e
        }
        set({ step: 'loading' })
        set({ step: 'chat', shared: await loadSharedLegacy(ownerUid, (sharedKey ? sharedKey.split(',') : []) as LegacyKind[]) })
      } catch {
        set({ step: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ownerUid, sharedKey, attempt])

  const fallbackName = linkName(link)

  if (state.step === 'chat') {
    const name = ownerDisplayName(state.shared.profile, link.ownerName)
    return <MemorialChat user={user} ownerUid={ownerUid} ownerName={name} inheritorName={inheritorName} shared={state.shared} onBack={onBack} />
  }
  if (state.step === 'question') {
    return (
      <UnlockScreen
        ownerName={fallbackName}
        ownerUid={ownerUid}
        inheritorUid={user.uid}
        questionId={link.questionId}
        onUnlocked={() => setAttempt((n) => n + 1)}
        onRelocked={() => setState({ step: 'closed', relocked: true })}
        onBack={onBack}
      />
    )
  }
  return (
    <div className="grid gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back to Legacy
        </Button>
      </div>
      {state.step === 'closed' ? (
        <Alert variant="info">{state.relocked ? RELOCKED_MESSAGE : <>{fallbackName}&apos;s legacy is locked right now.</>}</Alert>
      ) : state.step === 'error' ? (
        <Alert variant="danger">
          Couldn&apos;t open {fallbackName}&apos;s legacy.{' '}
          <button type="button" className="underline" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </Alert>
      ) : (
        <Skeleton className="h-[420px] w-full" />
      )}
    </div>
  )
}
