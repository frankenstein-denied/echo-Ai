'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { Check, FileText, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { addNote, memoriesCol, notesCol, type Note } from '@/lib/firestore'
import { filterNotes, notesInPeriod } from '@/lib/echo/view-helpers'
import { DEFAULT_PERIOD, emptyPeriodText, PERIOD_OPTIONS, type Period } from '@/lib/echo/period'
import { filterByCategory, noteCategories, previewText, relativeDate, sortByUpdated } from '@/lib/echo/notes-helpers'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { glowCardStyle, isPersonTag, personLabelSet } from '@/lib/echo/glow'
import { Alert, Button, EmptyState, Input, PageHeader, Segmented, Skeleton } from './ui'
import { useDay } from './use-day'
import { NoteEditor } from './note-editor'
import { Sheet, SheetItem } from './sheet'
import { GlowDot, KindTag } from './glow'

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

const NO_PEOPLE = new Set<string>()

function NoteCard({ note, people, onOpen }: { note: NoteRow; people: Set<string>; onOpen: () => void }) {
  const preview = previewText(note.body)
  return (
    <button
      type="button"
      onClick={onOpen}
      style={glowCardStyle('note')}
      className={`flex h-full min-h-40 w-full flex-col rounded-xl border p-5 text-left max-sm:min-h-0 max-sm:p-4 transition-[filter] hover:brightness-125 ${FOCUS_RING}`}
    >
      <span className="flex w-full items-center gap-2">
        <GlowDot kind="note" />
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{note.title || 'Untitled'}</span>
      </span>
      <span className={`mt-2 line-clamp-3 text-sm leading-5 ${preview ? 'text-muted-foreground' : 'text-subtle'}`}>{preview || 'No content yet'}</span>
      <span className="mt-auto flex w-full flex-wrap items-center gap-1.5 pt-4">
        <KindTag kind="note">{note.category}</KindTag>
        {note.tags.slice(0, 3).map((t) => (
          <KindTag key={t} kind={isPersonTag(t, people) ? 'person' : null}>{t}</KindTag>
        ))}
        {note.tags.length > 3 && <KindTag kind={null}>+{note.tags.length - 3}</KindTag>}
        <span className="ml-auto text-xs text-muted-foreground">{relativeDate(updatedMs(note), Date.now())}</span>
      </span>
    </button>
  )
}

export function NotesView({ uid }: { uid: string }) {
  const day = useDay()
  const [notes, setNotes] = useState<NoteRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [filterSheet, setFilterSheet] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const savedScroll = useRef<{ el: HTMLElement | null; top: number } | null>(null)
  const seenOpen = useRef(false)
  const [people, setPeople] = useState<Set<string>>(NO_PEOPLE)

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

  // Tags naming a known person memory are tinted rose.
  useEffect(() => {
    return onSnapshot(
      query(memoriesCol(uid), where('type', '==', 'person')),
      (snap) => setPeople(personLabelSet(snap.docs.map((s) => s.data().label))),
      () => setPeople(NO_PEOPLE),
    )
  }, [uid])

  const categories = useMemo(() => noteCategories(notes ?? []), [notes])
  const activeCategory = category === 'All' || categories.some((c) => c.toLowerCase() === category.toLowerCase()) ? category : 'All'
  const visible = useMemo(() => {
    const withMs = (notes ?? []).map((n) => ({ ...n, createdMs: n.createdAt?.toMillis?.() ?? null, updatedMs: n.updatedAt?.toMillis?.() ?? null }))
    return filterByCategory(filterNotes(notesInPeriod(withMs, period, new Date()), search), activeCategory)
  }, [notes, search, activeCategory, period, day])
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
      setPeriod(DEFAULT_PERIOD)
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
  const emptyDescription = filtering ? 'Nothing matches your search or filter.' : period !== 'all' ? `${emptyPeriodText(period)} Pick another period.` : 'Nothing to show.'

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
        <div className="mb-3 max-w-full overflow-x-auto">
          <Segmented ariaLabel="Time period" value={period} onChange={(v) => setPeriod(v as Period)} options={PERIOD_OPTIONS} />
        </div>
      )}
      {notes !== null && notes.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 max-lg:mb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted-foreground max-lg:top-3.5" />
            <Input aria-label="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search notes" />
          </div>
          {categories.length > 1 && (
            <Button variant="secondary" icon={SlidersHorizontal} className="w-full sm:w-auto lg:hidden" aria-label="Filter notes" aria-haspopup="dialog" aria-expanded={filterSheet} onClick={() => setFilterSheet(true)}>
              {activeCategory === 'All' ? 'All categories' : activeCategory}
            </Button>
          )}
          {categories.length > 1 && (
            <div className="max-w-full overflow-x-auto max-lg:hidden">
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
          description={emptyDescription}
          action={<Button variant="secondary" onClick={() => { setSearch(''); setCategory('All'); setPeriod('all') }}>Clear filters</Button>}
        />
      ) : (
        <ul className="grid gap-4 max-sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((n) => (
            <li key={n.id}>
              <NoteCard note={n} people={people} onOpen={() => open(n.id)} />
            </li>
          ))}
        </ul>
      )}
      <Sheet open={filterSheet} onClose={() => setFilterSheet(false)} title="Filter notes" description="Show notes from one category.">
        <div className="grid gap-1">
          {['All', ...categories].map((c) => (
            <SheetItem
              key={c}
              label={c === 'All' ? 'All categories' : c}
              icon={c === activeCategory ? Check : undefined}
              active={c === activeCategory}
              aria-pressed={c === activeCategory}
              className={c === activeCategory ? '' : 'pl-[44px]'}
              onClick={() => {
                setCategory(c)
                setFilterSheet(false)
              }}
            />
          ))}
        </div>
      </Sheet>
    </div>
  )
}
