'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from 'firebase/auth'
import { limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { ArrowLeft, BookOpen, MoreVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { createDiaryPage, deleteDiaryPage, diaryPagesCol, migrateFlatMessages, renameDiaryPage, type DiaryPage, type UserProfile } from '@/lib/firestore'
import { filterPages, isPermissionDenied, normalizeTitle, relativeTime, RULES_MESSAGE, sortPages, TITLE_MAX } from '@/lib/echo/diary'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Alert, Button, Card, EmptyState, IconButton, PageHeader, Skeleton } from './ui'
import { Home, type HomeView } from './home'

type Page = DiaryPage & { id: string }
// key changes only when the user picks a page, so an auto-created page keeps the live chat mounted.
type Selection = { id: string | null; key: number }

function greeting(d: Date): string {
  const h = d.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  return 'Good evening'
}

function ConfirmDelete({ title, busy, error, onCancel, onConfirm }: { title: string; busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    return () => prev?.focus()
  }, [])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation()
      onCancel()
    }
    if (e.key === 'Tab' && ref.current) {
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled])'))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onKeyDown={onKeyDown}>
      <div aria-hidden="true" className="absolute inset-0 bg-background/80" onClick={busy ? undefined : onCancel} />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-desc" className="relative w-full max-w-md rounded-xl border border-border-strong bg-surface p-6">
        <h2 id="del-title" className="text-base font-semibold text-foreground">Delete &ldquo;{title}&rdquo;?</h2>
        <p id="del-desc" className="mt-2 text-sm text-muted-foreground">
          This page and all its messages will be deleted. Notes, reminders, goals, health logs and memories Echo saved from it stay.
        </p>
        {error && (
          <div className="mt-3">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon={Trash2} onClick={onConfirm} loading={busy}>
            Delete page
          </Button>
        </div>
      </div>
    </div>
  )
}

function RowMenu({ title, onRename, onDelete }: { title: string; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const item = `flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm ${FOCUS_RING} hover:bg-surface`
  return (
    <div ref={box} className="relative" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <IconButton icon={MoreVertical} label={`Actions for ${title}`} size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-border-strong bg-surface-2 p-1">
          <button
            role="menuitem"
            type="button"
            className={`${item} text-foreground`}
            onClick={() => {
              setOpen(false)
              onRename()
            }}
          >
            <Pencil size={16} aria-hidden="true" /> Rename
          </button>
          <button
            role="menuitem"
            type="button"
            className={`${item} text-danger`}
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            <Trash2 size={16} aria-hidden="true" /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

function TitleEditor({ title, editing, setEditing, onSave }: { title: string; editing: boolean; setEditing: (v: boolean) => void; onSave: (t: string) => Promise<void> }) {
  const [draft, setDraft] = useState(title)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)
  useEffect(() => {
    if (editing) {
      done.current = false
      setDraft(title)
      setError(null)
    }
    // Only reset when editing starts: a snapshot changing `title` mid-edit must not wipe the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])
  const commit = async () => {
    if (done.current) return
    const t = normalizeTitle(draft)
    if (!t) {
      setError(`Title must be 1-${TITLE_MAX} characters.`)
      return
    }
    done.current = true
    if (t === title) {
      setEditing(false)
      return
    }
    try {
      await onSave(t)
      setEditing(false)
    } catch (e) {
      done.current = false
      setError(isPermissionDenied(e) ? RULES_MESSAGE : 'Could not rename this page.')
    }
  }
  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <h2 className="truncate text-xl font-semibold text-foreground">{title}</h2>
        <IconButton icon={Pencil} label="Rename page" size="sm" onClick={() => setEditing(true)} />
      </div>
    )
  }
  return (
    <div className="min-w-0 flex-1">
      <input
        autoFocus
        aria-label="Page title"
        aria-invalid={error ? true : undefined}
        value={draft}
        maxLength={TITLE_MAX}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            done.current = true
            setEditing(false)
          }
        }}
        className={`h-10 w-full rounded-lg border border-input-border bg-surface-2 px-3 text-lg font-semibold text-foreground ${FOCUS_RING}`}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function DiaryView({ user, profile, onNavigate }: { user: User; profile: UserProfile; onNavigate: (v: HomeView) => void }) {
  const uid = user.uid
  const [ready, setReady] = useState(false) // migration finished (or failed)
  const [rulesError, setRulesError] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pages, setPages] = useState<Page[] | null>(null)
  const [sel, setSel] = useState<Selection>({ id: null, key: 0 })
  const [auto, setAuto] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(false)
  const [del, setDel] = useState<Page | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    let cancelled = false
    migrateFlatMessages(uid)
      .catch((e) => {
        console.error('diary migration', e)
        if (cancelled) return
        if (isPermissionDenied(e)) setRulesError(true)
        else setNotice('Could not move your earlier messages into the diary yet. Reload to try again.')
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  useEffect(() => {
    if (!ready) return
    const pq = query(diaryPagesCol(uid), orderBy('updatedAt', 'desc'), limit(200))
    return onSnapshot(
      pq,
      (snap) => setPages(snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }))),
      (e) => {
        console.error('diaryPages listener', e)
        if (isPermissionDenied(e)) setRulesError(true)
        else setNotice('Could not load your diary pages.')
        setPages((p) => p ?? [])
      },
    )
  }, [uid, ready])

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Land on the most recently updated page once.
  useEffect(() => {
    if (auto || pages === null) return
    setAuto(true)
    if (pages.length) {
      setSel((s) => (s.id ? s : { id: pages[0].id, key: s.key }))
      setMobileOpen(true)
    }
  }, [pages, auto])

  // If the open page vanishes (deleted from another tab), fall back to the newest remaining page.
  const seen = useRef(new Set<string>())
  useEffect(() => {
    if (!pages) return
    pages.forEach((p) => seen.current.add(p.id))
    if (sel.id && seen.current.has(sel.id) && !pages.some((p) => p.id === sel.id)) {
      const next = sortPages(pages)[0]
      setSel((s) => ({ id: next?.id ?? null, key: s.key + 1 }))
      setEditing(false)
      if (!next) setMobileOpen(false)
    }
  }, [pages, sel.id])

  const sorted = useMemo(() => sortPages(pages ?? []), [pages])
  const shown = useMemo(() => filterPages(sorted, q), [sorted, q])
  const active = sel.id ? (sorted.find((p) => p.id === sel.id) ?? null) : null

  const select = (id: string | null) => {
    setSel((s) => ({ id, key: s.key + 1 }))
    setEditing(false)
    setMobileOpen(true)
  }

  const newPage = async () => {
    if (creating) return
    setCreating(true)
    try {
      select(await createDiaryPage(uid))
      setNotice(null)
    } catch (e) {
      if (isPermissionDenied(e)) setRulesError(true)
      else setNotice('Could not create a page.')
    } finally {
      setCreating(false)
    }
  }

  // Used by the chat when a message is sent with no page open: same view, no remount.
  const ensurePage = useCallback(async () => {
    const id = await createDiaryPage(uid)
    setSel((s) => ({ id, key: s.key }))
    return id
  }, [uid])

  const confirmDelete = async () => {
    if (!del) return
    setDelBusy(true)
    setDelError(null)
    try {
      await deleteDiaryPage(uid, del.id)
      if (sel.id === del.id) {
        const next = sorted.find((p) => p.id !== del.id)
        setSel((s) => ({ id: next?.id ?? null, key: s.key + 1 }))
        setEditing(false)
        if (!next) setMobileOpen(false)
      }
      setDel(null)
    } catch (e) {
      setDelError(isPermissionDenied(e) ? RULES_MESSAGE : 'Could not delete this page. Try again.')
    } finally {
      setDelBusy(false)
    }
  }

  const name = profile.preferredName
  const dateLine = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(active?.createdAt?.toDate?.() ?? new Date())
  const desc = `${greeting(new Date())}${name ? `, ${name}` : ''}. Each page is one conversation.`

  if (rulesError) {
    return (
      <div className="animate-in">
        <PageHeader title="Diary" description={desc} />
        <Alert variant="danger" title={RULES_MESSAGE}>
          Publish the latest firestore.rules in the Firebase console (Firestore Database, Rules), then reload.
        </Alert>
      </div>
    )
  }

  const list = (
    <div className={`min-w-0 ${mobileOpen ? 'hidden lg:block' : 'block'}`}>
      <div className="relative mb-3">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search diary pages"
          placeholder="Search pages"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`h-10 w-full rounded-lg border border-input-border bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground ${FOCUS_RING}`}
        />
      </div>
      {pages === null ? (
        <div className="grid gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : shown.length === 0 && q ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No pages match &ldquo;{q}&rdquo;.</p>
      ) : (
        <ul className="grid gap-1 lg:max-h-[calc(100vh-18rem)] lg:overflow-y-auto">
          {shown.map((p) => {
            const isActive = p.id === sel.id
            return (
              <li key={p.id} className={`flex items-start gap-1 rounded-lg border p-1 ${isActive ? 'border-primary/40 bg-primary-soft' : 'border-transparent hover:bg-surface-2'}`}>
                <button type="button" onClick={() => select(p.id)} aria-current={isActive ? 'page' : undefined} className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left ${FOCUS_RING}`}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{p.title}</span>
                    <span className="shrink-0 text-xs text-subtle">{p.updatedAt ? relativeTime(p.updatedAt.toMillis()) : 'just now'}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{p.preview || 'No messages yet'}</span>
                </button>
                <RowMenu
                  title={p.title}
                  onRename={() => {
                    if (sel.id !== p.id) select(p.id)
                    setEditing(true)
                  }}
                  onDelete={() => {
                    setDelError(null)
                    setDel(p)
                  }}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  return (
    <div className="animate-in">
      <PageHeader
        title="Diary"
        description={desc}
        action={
          <Button icon={Plus} onClick={() => void newPage()} loading={creating}>
            New page
          </Button>
        }
      />
      {notice && (
        <div className="mb-4">
          <Alert variant="warning">{notice}</Alert>
        </div>
      )}
      {pages !== null && pages.length === 0 && !sel.id ? (
        <EmptyState
          icon={BookOpen}
          title="Your diary is empty"
          description="Each page is a conversation with Echo. Start one and say anything; you can rename or delete pages later."
          action={
            <Button icon={Plus} onClick={() => void newPage()} loading={creating}>
              Start your first page
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          {list}
          <div className={`min-w-0 ${mobileOpen ? 'block' : 'hidden lg:block'}`}>
            <Card className="mb-5 flex items-center gap-2 p-3">
              <IconButton icon={ArrowLeft} label="Back to pages" size="sm" className="lg:hidden" onClick={() => setMobileOpen(false)} />
              <div className="min-w-0 flex-1">
                {active ? (
                  <TitleEditor title={active.title} editing={editing} setEditing={setEditing} onSave={(t) => renameDiaryPage(uid, active.id, t)} />
                ) : (
                  <h2 className="text-xl font-semibold text-foreground">New page</h2>
                )}
                <p className="px-1 text-xs text-muted-foreground">{dateLine}</p>
              </div>
              {active && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {active.messageCount} {active.messageCount === 1 ? 'message' : 'messages'}
                </span>
              )}
            </Card>
            <Home key={sel.key} user={user} profile={profile} pageId={sel.id} onEnsurePage={ensurePage} disabled={pages === null} onNavigate={onNavigate} />
          </div>
        </div>
      )}
      {del && <ConfirmDelete title={del.title} busy={delBusy} error={delError} onCancel={() => setDel(null)} onConfirm={() => void confirmDelete()} />}
    </div>
  )
}
