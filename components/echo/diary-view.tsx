'use client'

import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from 'firebase/auth'
import { limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { ArrowLeft, BookOpen, MoreVertical, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { createDiaryPage, deleteDiaryPage, diaryPagesCol, migrateFlatMessages, pageMemoryImpact, renameDiaryPage, type DiaryPage, type UserProfile } from '@/lib/firestore'
import { filterPages, isPermissionDenied, normalizeTitle, relativeTime, RULES_MESSAGE, sortPages, TITLE_MAX } from '@/lib/echo/diary'
import { pageDeleteBody } from '@/lib/echo/links'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Alert, Button, ConfirmDialog, EmptyState, IconButton, PageHeader, Skeleton } from './ui'
import { Home, type HomeView } from './home'
import { MobileTitleBar } from './mobile-tabbar'
import { Sheet, SheetItem } from './sheet'
import { useIsMobile } from './use-mobile'

type Page = DiaryPage & { id: string }
// key changes only when the user picks a page, so an auto-created page keeps the live chat mounted.
type Selection = { id: string | null; key: number }

const LIST_KEY = 'echo.diary.listCollapsed'

function greeting(d: Date): string {
  const h = d.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  return 'Good evening'
}

function RowMenu({ title, onRename, onDelete }: { title: string; onRename: () => void; onDelete: () => void }) {
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 })
  const box = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)
    }
    const dismiss = () => setOpen(false)
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        box.current?.querySelector<HTMLElement>('button')?.focus()
      }
    }
    document.addEventListener('keydown', esc)
    menu.current?.querySelector<HTMLElement>('button')?.focus()
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])
  // Fixed-position menu so the scrolling page list can never clip it; opens upward near the viewport bottom.
  const toggle = () => {
    if (mobile) {
      setSheet(true)
      return
    }
    if (!open && box.current) {
      const r = box.current.getBoundingClientRect()
      const right = window.innerWidth - r.right
      setPos(window.innerHeight - r.bottom < 110 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right })
    }
    setOpen(!open)
  }
  const item = `flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm ${FOCUS_RING} hover:bg-surface`
  return (
    <div ref={box} className="relative">
      <IconButton icon={MoreVertical} label={`Actions for ${title}`} size="sm" aria-haspopup={mobile ? 'dialog' : 'menu'} aria-expanded={mobile ? sheet : open} onClick={toggle} />
      <Sheet open={sheet} onClose={() => setSheet(false)} title={title}>
        <div className="grid gap-1">
          <SheetItem
            icon={Pencil}
            label="Rename"
            onClick={() => {
              setSheet(false)
              onRename()
            }}
          />
          <SheetItem
            icon={Trash2}
            label="Delete"
            tone="danger"
            onClick={() => {
              setSheet(false)
              onDelete()
            }}
          />
        </div>
      </Sheet>
      {open &&
        !mobile &&
        createPortal(
        <div ref={menu} role="menu" style={pos} className="fixed z-40 w-36 rounded-lg border border-border-strong bg-surface-2 p-1">
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
        </div>,
        document.body,
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
        <h2 className="truncate text-lg font-semibold text-foreground lg:text-xl">{title}</h2>
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

export function DiaryView({
  user,
  profile,
  onNavigate,
  openPageId,
  onOpenPageHandled,
}: {
  user: User
  profile: UserProfile
  onNavigate: (v: HomeView) => void
  /** A page to open once (e.g. from the 2nd Brain); cleared through onOpenPageHandled. */
  openPageId?: string | null
  onOpenPageHandled?: () => void
}) {
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
  // nodes the delete would remove: undefined = still counting, null = counting failed
  const [delCount, setDelCount] = useState<number | null | undefined>(undefined)
  const [creating, setCreating] = useState(false)
  const [, tick] = useState(0)
  const [collapsed, setCollapsed] = useState(false) // page list collapsed to an icon rail (desktop)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(LIST_KEY) === '1')
    } catch {}
  }, [])
  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(LIST_KEY, next ? '1' : '0')
    } catch {}
  }

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

  // Open a page requested from elsewhere (once the list has loaded), then clear the request.
  useEffect(() => {
    if (!openPageId || pages === null) return
    if (pages.some((p) => p.id === openPageId)) {
      setSel((s) => ({ id: openPageId, key: s.key + 1 }))
      setEditing(false)
      setMobileOpen(true)
    }
    onOpenPageHandled?.()
  }, [openPageId, pages, onOpenPageHandled])

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

  const delId = del?.id
  useEffect(() => {
    if (!delId) return
    let live = true
    setDelCount(undefined)
    pageMemoryImpact(uid, delId).then(
      (r) => live && setDelCount(r.exclusive.length),
      () => live && setDelCount(null),
    )
    return () => {
      live = false
    }
  }, [uid, delId])

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
        <MobileTitleBar title="Diary" />
        <PageHeader title="Diary" description={desc} />
        <Alert variant="danger" title={RULES_MESSAGE}>
          Publish the latest firestore.rules in the Firebase console (Firestore Database, Rules), then reload.
        </Alert>
      </div>
    )
  }

  const railBtn = collapsed ? 'lg:hidden' : ''
  const list = (
    <aside aria-label="Diary pages" className={`${mobileOpen ? 'hidden lg:flex' : 'flex'} min-h-0 w-full shrink-0 flex-col border-border lg:border-r ${collapsed ? 'lg:w-14' : 'lg:w-[260px]'}`}>
      <div className={`flex items-center gap-2 px-4 pb-3 pt-4 ${collapsed ? 'lg:flex-col lg:px-2' : ''}`}>
        <h1 className={`text-base font-semibold text-foreground max-lg:text-xl ${railBtn}`}>Diary</h1>
        <div className={`ml-auto flex items-center gap-1 ${collapsed ? 'lg:ml-0 lg:flex-col' : ''}`}>
          <Button size="sm" icon={Plus} onClick={() => void newPage()} loading={creating} className={railBtn}>
            New page
          </Button>
          {collapsed && <IconButton icon={Plus} label="New page" size="sm" className="hidden lg:inline-flex" onClick={() => void newPage()} disabled={creating} />}
          <IconButton icon={collapsed ? PanelLeftOpen : PanelLeftClose} label={collapsed ? 'Expand page list' : 'Collapse page list'} size="sm" className="hidden lg:inline-flex" aria-expanded={!collapsed} onClick={toggleCollapsed} />
        </div>
      </div>
      <div className={`flex min-h-0 flex-1 flex-col ${railBtn}`}>
        <div className="relative mx-4 mb-3">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search diary pages"
            placeholder="Search pages"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`h-10 w-full rounded-lg border border-input-border bg-surface-2 pl-9 pr-3 text-sm max-lg:h-11 text-foreground placeholder:text-muted-foreground ${FOCUS_RING}`}
          />
        </div>
        {pages === null ? (
          <div className="grid gap-2 px-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : shown.length === 0 && q ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No pages match &ldquo;{q}&rdquo;.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
            {shown.map((p) => {
              const isActive = p.id === sel.id
              return (
                <li key={p.id} className={`flex shrink-0 items-start gap-1 rounded-lg p-1 max-lg:items-center ${isActive ? 'bg-primary-soft' : 'hover:bg-surface-2'}`}>
                  <button type="button" onClick={() => select(p.id)} aria-current={isActive ? 'page' : undefined} className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left max-lg:py-2 ${FOCUS_RING}`}>
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
                      else setMobileOpen(true) // mobile list view: show the page pane so the title editor is visible
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
    </aside>
  )

  const header = (
    <div className="flex items-center gap-2">
      <IconButton icon={ArrowLeft} label="Back to pages" size="sm" className="lg:hidden" onClick={() => setMobileOpen(false)} />
      <div className="min-w-0 flex-1">
        {active ? (
          <TitleEditor title={active.title} editing={editing} setEditing={setEditing} onSave={(t) => renameDiaryPage(uid, active.id, t)} />
        ) : (
          <h2 className="text-lg font-semibold text-foreground">New page</h2>
        )}
        <p className="px-1 text-xs text-muted-foreground">{dateLine}</p>
      </div>
    </div>
  )
  const meta = active ? `${active.messageCount} ${active.messageCount === 1 ? 'message' : 'messages'}` : undefined

  return (
    <div className="animate-in lg:flex lg:h-full lg:flex-col">
      {notice && (
        <div className={`mb-4 shrink-0 ${pages !== null && (pages.length > 0 || sel.id) ? 'max-lg:hidden' : ''}`}>
          <Alert variant="warning">{notice}</Alert>
        </div>
      )}
      {pages !== null && pages.length === 0 && !sel.id ? (
        <>
          <MobileTitleBar title="Diary" />
          <PageHeader title="Diary" description={desc} />
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
        </>
      ) : (
        <div className="diary-mobile-shell flex h-[calc(100dvh-6rem)] min-h-[26rem] flex-col overflow-hidden rounded-xl border border-border bg-surface md:h-[calc(100dvh-8rem)] lg:min-h-0 lg:flex-1 lg:rounded-none lg:border-0 lg:flex-row">
          {notice && (
            <div className="shrink-0 px-4 pt-3 lg:hidden">
              <Alert variant="warning">{notice}</Alert>
            </div>
          )}
          {list}
          <div className={`min-h-0 min-w-0 flex-1 ${mobileOpen ? 'flex' : 'hidden lg:flex'}`}>
            <Home key={sel.key} user={user} profile={profile} pageId={sel.id} onEnsurePage={ensurePage} disabled={pages === null} onNavigate={onNavigate} header={header} meta={meta} hint={desc} />
          </div>
        </div>
      )}
      {del && <ConfirmDialog title={`Delete \u201c${del.title}\u201d?`} body={delCount === undefined ? 'Checking your 2nd Brain\u2026' : pageDeleteBody(delCount)} confirmLabel="Delete page" busy={delBusy} error={delError} onCancel={() => setDel(null)} onConfirm={() => void confirmDelete()} />}
    </div>
  )
}
