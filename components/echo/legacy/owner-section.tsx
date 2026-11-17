'use client'

import { useEffect, useMemo, useState } from 'react'
import { sendEmailVerification, type User } from 'firebase/auth'
import { MessageCircleHeart, Pencil, Trash2 } from 'lucide-react'
import { auth } from '@/lib/firebase'
import type { UserProfile } from '@/lib/firestore'
import { isValidAnswer, monthsToMinutes, questionText, releaseOptions, type LegacyKind } from '@/lib/echo/legacy'
import { setLegacyEnabledCache } from '@/lib/echo/legacy-activity'
import {
  getLegacySettings,
  removeInheritor,
  saveLegacySettings,
  updateInheritor,
  upsertDirectoryEntry,
  watchMyInheritors,
  type LegacyLink,
} from '@/lib/legacy-store'
import { Alert, Badge, Button, Card, ConfirmDialog, IconButton, Input, Select, Skeleton, Switch } from '../ui'
import { AddInheritor } from './add-inheritor'
import { ANSWER_HINT, ANSWER_INVALID, INHERITOR_ERROR, KIND_LABEL, KindPicker, QuestionSelect } from './kinds'
import { markLegacyProfileWritten } from './use-legacy-activity'
import { VoiceCard } from './voice-card'

// Thesis demo: always offer the 5-minute release option. Set back to the env check for production.
const DEMO = true // process.env.NEXT_PUBLIC_LEGACY_DEMO === '1'
const DEFAULT_MINUTES = monthsToMinutes(6)

function minutesLabel(minutes: number): string {
  const known = releaseOptions(true).find((o) => o.minutes === minutes)
  if (known) return known.label
  if (minutes < 1440) return `${minutes} minutes`
  const days = Math.round(minutes / 1440)
  return days % 30 === 0 ? `${days / 30} months` : `${days} days`
}

function displayName(link: LegacyLink): string {
  return link.inheritorName || link.inheritorEmail
}

/** Email/password accounts must verify before others can find them as an inheritor. */
function VerifyBanner({ user }: { user: User }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'checking' | 'done'>('idle')
  const [error, setError] = useState('')
  const needs = user.providerData.some((p) => p.providerId === 'password') && !user.emailVerified
  if (!needs || state === 'done') return null

  async function send() {
    setState('sending')
    setError('')
    try {
      await sendEmailVerification(user)
      setState('sent')
    } catch {
      setError("Couldn't send the email. Wait a moment and try again.")
      setState('idle')
    }
  }

  async function check() {
    setState('checking')
    setError('')
    try {
      await user.reload()
      const fresh = auth.currentUser
      if (fresh?.emailVerified) {
        // The rules read email_verified from the ID token, which still says false until it is refreshed.
        try {
          await fresh.getIdToken(true)
          await upsertDirectoryEntry(fresh)
        } catch {
          setError("Your email is verified, but we couldn't list you yet. Try again in a moment.")
          setState('sent')
          return
        }
        setState('done')
      } else {
        setError("Your email isn't verified yet. Open the link in the email first.")
        setState('sent')
      }
    } catch {
      setError("Couldn't check right now. Try again.")
      setState('sent')
    }
  }

  return (
    <Alert variant="warning" title="Verify your email so people can add you as an inheritor">
      <p>{state === 'sent' || state === 'checking' ? `We sent a link to ${user.email}. Open it, then come back here.` : 'Until you do, nobody can name you in their legacy.'}</p>
      {error && <p className="mt-1 text-danger">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={state === 'sending'} onClick={() => void send()}>
          {state === 'sent' || state === 'checking' ? 'Send again' : 'Send verification email'}
        </Button>
        {(state === 'sent' || state === 'checking') && (
          <Button size="sm" loading={state === 'checking'} onClick={() => void check()}>
            I've verified
          </Button>
        )}
      </div>
    </Alert>
  )
}

function InheritorRow({ link, ownerUid, onRemove }: { link: LegacyLink; ownerUid: string; onRemove: (l: LegacyLink) => void }) {
  const [editing, setEditing] = useState(false)
  const [questionId, setQuestionId] = useState(link.questionId)
  const [answer, setAnswer] = useState('')
  const [shared, setShared] = useState<LegacyKind[]>(link.shared)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const questionChanged = questionId !== link.questionId
  const answerError = answer.trim() && !isValidAnswer(answer) ? ANSWER_INVALID : undefined
  const name = displayName(link)
  const wrong = link.attempt?.wrong ? link.attempt.count : 0

  function open() {
    setQuestionId(link.questionId)
    setAnswer('')
    setShared(link.shared)
    setError('')
    setEditing(true)
  }

  async function save() {
    setError('')
    if (questionChanged && !answer.trim()) return setError('A new question needs a new answer.')
    if (answerError) return setError(answerError)
    setBusy(true)
    try {
      const res = await updateInheritor(ownerUid, link.inheritorUid, {
        ...(questionChanged ? { questionId } : {}),
        ...(answer.trim() ? { answer } : {}),
        shared,
      })
      if (!res.ok) return setError(INHERITOR_ERROR[res.error])
      setEditing(false)
    } catch {
      setError("Couldn't save the changes. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {link.inheritorName && <p className="truncate text-xs text-muted-foreground">{link.inheritorEmail}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {link.status === 'accepted' ? <Badge variant="success">✓ Accepted</Badge> : <Badge variant="warning">⏳ Waiting</Badge>}
            {wrong > 0 && <Badge variant="danger">{wrong === 1 ? '1 wrong try' : `${wrong} wrong tries`}</Badge>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Question: &ldquo;{questionText(link.questionId) ?? 'Unknown question'}&rdquo;</p>
          <p className="text-xs text-muted-foreground">Can open: {link.shared.length ? link.shared.map((k) => KIND_LABEL[k]).join(', ') : 'only your voice and profile'}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconButton icon={Pencil} size="sm" label={`Edit ${name}`} onClick={editing ? () => setEditing(false) : open} aria-expanded={editing} />
          <IconButton icon={Trash2} size="sm" label={`Remove ${name}`} onClick={() => onRemove(link)} />
        </div>
      </div>
      {editing && (
        <div className="mt-4 grid gap-4 border-t border-border pt-4">
          <QuestionSelect value={questionId} onChange={setQuestionId} disabled={busy} label="Question" />
          <Input
            label={questionChanged ? 'New answer' : 'New answer (optional)'}
            placeholder={questionChanged ? undefined : 'Leave empty to keep the current answer'}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={60}
            hint={ANSWER_HINT}
            error={answerError}
            required={questionChanged}
            disabled={busy}
          />
          <KindPicker value={shared} onChange={setShared} disabled={busy} />
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy} onClick={() => void save()} disabled={(questionChanged && !answer.trim()) || !!answerError}>
              Save
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** The owner's side of Legacy: on/off, release period, inheritors, voice and preview. */
export function OwnerSection({ user, profile, onPreview }: { user: User; profile: UserProfile; onPreview?: () => void }) {
  const uid = user.uid
  const [loaded, setLoaded] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)
  const [hasSettings, setHasSettings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  // A failed first load must not let a save overwrite the real settings with the defaults.
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [links, setLinks] = useState<LegacyLink[] | null>(null)
  const [linksError, setLinksError] = useState('')
  const [removing, setRemoving] = useState<LegacyLink | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setLoadFailed(false)
    setSettingsError('')
    getLegacySettings(uid)
      .then((s) => {
        if (cancelled) return
        if (s) {
          setEnabled(s.enabled)
          setMinutes(s.releaseAfterMinutes)
          setHasSettings(true)
        }
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setSettingsError("Couldn't load your Legacy settings.")
        setLoadFailed(true)
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [uid, loadAttempt])

  useEffect(
    () =>
      watchMyInheritors(
        uid,
        (l) => {
          setLinks(l)
          setLinksError('')
        },
        () => {
          setLinks([])
          setLinksError("Couldn't load your inheritors.")
        },
      ),
    [uid],
  )

  const options = useMemo(() => {
    const opts = releaseOptions(DEMO)
    return opts.some((o) => o.minutes === minutes) ? opts : [...opts, { label: minutesLabel(minutes), minutes }]
  }, [minutes])
  const label = options.find((o) => o.minutes === minutes)?.label ?? minutesLabel(minutes)

  async function save(next: { enabled: boolean; releaseAfterMinutes: number }) {
    if (loadFailed) return
    const prev = { enabled, minutes }
    setEnabled(next.enabled)
    setMinutes(next.releaseAfterMinutes)
    setSaving(true)
    setSettingsError('')
    try {
      await saveLegacySettings(uid, next)
      setHasSettings(true)
      setLegacyEnabledCache(uid, next.enabled)
      // saveLegacySettings also refreshed the profile copy inheritors read.
      if (next.enabled) markLegacyProfileWritten(uid, profile)
    } catch {
      setEnabled(prev.enabled)
      setMinutes(prev.minutes)
      setSettingsError("Couldn't save your Legacy settings. Try again.")
    } finally {
      setSaving(false)
    }
  }

  function pickMinutes(m: number) {
    if (loadFailed) return
    if (enabled || hasSettings) void save({ enabled, releaseAfterMinutes: m })
    else setMinutes(m)
  }

  async function confirmRemove() {
    if (!removing) return
    setRemoveBusy(true)
    setRemoveError(null)
    try {
      await removeInheritor(uid, removing.inheritorUid)
      setRemoving(null)
    } catch {
      setRemoveError("Couldn't remove them. Try again.")
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <div className="grid gap-5">
      <VerifyBanner user={user} />

      <Card>
        {!loaded ? (
          <div className="grid gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">Your legacy</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Let the people you choose open your memories and talk with an Echo that types like you, if you stop using Echo.
                </p>
              </div>
              <Switch checked={enabled} onChange={(v) => void save({ enabled: v, releaseAfterMinutes: minutes })} label="Turn on Legacy" disabled={saving || loadFailed} />
            </div>
            <Select label="Release my legacy after" value={String(minutes)} onChange={(e) => pickMinutes(Number(e.target.value))} disabled={saving || loadFailed}>
              {options.map((o) => (
                <option key={o.minutes} value={o.minutes}>
                  {o.label} with no activity
                </option>
              ))}
            </Select>
            <p className="text-sm text-muted-foreground">
              If you don&apos;t open Echo for {label}, your legacy is released to the people below. Opening Echo again locks it.
            </p>
            {!enabled && <p className="text-xs text-muted-foreground">Legacy is off. Nothing is released while it&apos;s off.</p>}
            {settingsError && <Alert variant="danger">{settingsError}</Alert>}
            {loadFailed && (
              <div>
                <Button size="sm" variant="secondary" onClick={() => setLoadAttempt((n) => n + 1)}>
                  Retry
                </Button>
              </div>
            )}
            {onPreview && (
              <div>
                <Button variant="secondary" icon={MessageCircleHeart} onClick={onPreview}>
                  Talk to my legacy
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">The preview uses everything you&apos;ve shared with Echo, not just what each person can open.</p>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-foreground">My inheritors</h2>
        {linksError && (
          <div className="mt-3">
            <Alert variant="danger">{linksError}</Alert>
          </div>
        )}
        {links === null ? (
          <div className="mt-4 grid gap-2">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : links.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No one yet. Add someone below.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {links.map((l) => (
              <InheritorRow key={l.id} link={l} ownerUid={uid} onRemove={(x) => { setRemoveError(null); setRemoving(x) }} />
            ))}
          </ul>
        )}
      </Card>

      <AddInheritor user={user} count={links?.length ?? 0} />

      <VoiceCard user={user} profile={profile} enabled={enabled} />

      {removing && (
        <ConfirmDialog
          title={`Remove ${displayName(removing)}?`}
          body="They won't be able to open your legacy. If you add them again, they'll get a new request and must answer again."
          confirmLabel="Remove"
          busy={removeBusy}
          error={removeError}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void confirmRemove()}
        />
      )}
    </div>
  )
}
