'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { FileText, Plus, Search } from 'lucide-react'
import { addNote, notesCol, type Note } from '@/lib/firestore'
import { filterNotes } from '@/lib/echo/view-helpers'
import { filterByCategory, noteCategories, previewText, relativeDate, sortByUpdated } from '@/lib/echo/notes-helpers'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Alert, Badge, Button, EmptyState, Input, PageHeader, Segmented, Skeleton } from './ui'
import { NoteEditor } from './note-editor'

type NoteRow = Note & { id: string }

const updatedMs = (n: NoteRow) => (n.updatedAt ?? n.createdAt)?.toMillis?.() ?? Date.now()

const fullDate = (n: NoteRow) =>
  n.createdAt ? `Created ${n.createdAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Just now'

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

function NoteCard({ note, onOpen }: { note: NoteRow; onOpen: () => void }) {
  const preview = previewText(note.body)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex h-full min-h-40 flex-col rounded-xl border border-border bg-surface p-5 text-left transition-colors hover:border-border-strong hover:bg-surface-2 ${FOCUS_RING}`}
    >
      <span className="block w-full truncate text-base font-semibold text-foreground">{note.title || 'Untitled'}</span>
      <span className={`mt-2 line-clamp-3 text-sm leading-5 ${preview ? 'text-muted-foreground' : 'text-subtle'}`}>{preview || 'No content yet'}</span>
      <span className="mt-auto flex w-full flex-wrap items-center gap-1.5 pt-4">
        <Badge variant="primary">{note.category}</Badge>
        {note.tags.slice(0, 3).map((t) => (
          <Badge key={t} variant="neutral">{t}</Badge>
        ))}
        {note.tags.length > 3 && <Badge variant="neutral">+{note.tags.length - 3}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{relativeDate(updatedMs(note), Date.now())}</span>
      </span>
    </button>
  )
}

export function NotesView({ uid }: { uid: string }) {
  const [notes, setNotes] = useState<NoteRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const savedScroll = useRef<{ el: HTMLElement | null; top: number } | null>(null)
  const seenOpen = useRef(false)

  useEffect(() => {
    const q = query(notesCol(uid), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        setNotes(sortByUpdated(snap.docs.map((s) => ({ ...s.data({ serverTimestamps: 'estimate' }), id: s.id }))))
        setLoadError('')
      },
      (e) => {
        setNotes([])
        setLoadError(e.message || 'Could not load your notes.')
      },
    )
  }, [uid])

  const categories = useMemo(() => noteCategories(notes ?? []), [notes])
  const activeCategory = category === 'All' || categories.some((c) => c.toLowerCase() === category.toLowerCase()) ? category : 'All'
  const visible = useMemo(() => filterByCategory(filterNotes(notes ?? [], search), activeCategory), [notes, search, activeCategory])
  const opened = openId ? notes?.find((n) => n.id === openId) ?? null : null

  const open = (id: string) => {
    const el = scrollParent(root.current)
    savedScroll.current = { el, top: el ? el.scrollTop : window.scrollY }
    seenOpen.current = false
    setOpenId(id)
    ;(el ?? window).scrollTo({ top: 0 })
  }

  const close = useCallback(() => {
    setOpenId(null)
    const s = savedScroll.current
    requestAnimationFrame(() => (s?.el ?? window).scrollTo({ top: s?.top ?? 0 }))
  }, [])

  // If the open note disappears (deleted elsewhere), return to the grid.
  useEffect(() => {
    if (!openId || notes === null) return
    if (opened) seenOpen.current = true
    else if (seenOpen.current) close()
  }, [openId, notes, opened, close])

  const create = async () => {
    setCreating(true)
    setError('')
    try {
      const id = await addNote(uid, { title: 'Untitled note', body: '', category: 'Diary', tags: [] })
      setSearch('')
      setCategory('All')
      open(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a note.')
    } finally {
      setCreating(false)
    }
  }

  if (openId) {
    return (
      <div ref={root}>
        {opened ? (
          <NoteEditor key={opened.id} uid={uid} note={opened} categories={categories} dateLabel={fullDate(opened)} onBack={close} />
        ) : (
          <Skeleton className="h-96" />
        )}
      </div>
    )
  }

  const filtering = search.trim() !== '' || activeCategory !== 'All'

  return (
    <div ref={root} className="animate-in">
      <PageHeader
        title="Notes"
        description="Everything you have written or told Echo to remember."
        action={<Button icon={Plus} onClick={create} loading={creating}>New note</Button>}
      />
      {(error || loadError) && (
        <div className="mb-4">
          <Alert variant="danger">{error || loadError}</Alert>
        </div>
      )}
      {notes !== null && notes.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
            <Input aria-label="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search notes" />
          </div>
          {categories.length > 1 && (
            <div className="max-w-full overflow-x-auto">
              <Segmented
                ariaLabel="Filter by category"
                value={activeCategory}
                onChange={setCategory}
                options={[{ value: 'All', label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))]}
              />
            </div>
          )}
        </div>
      )}
      {notes === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No notes yet"
          description="Create one, or tell Echo something to remember."
          action={<Button icon={Plus} onClick={create} loading={creating}>New note</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No notes found"
          description={filtering ? 'Nothing matches your search or filter.' : 'Nothing to show.'}
          action={<Button variant="secondary" onClick={() => { setSearch(''); setCategory('All') }}>Clear filters</Button>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((n) => (
            <li key={n.id}>
              <NoteCard note={n} onOpen={() => open(n.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
