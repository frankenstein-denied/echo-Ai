'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { User } from 'firebase/auth'
import { onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { FileText, Plus, Search, X } from 'lucide-react'
import { addNote, memoriesCol, notesCol, type Note, type UserProfile } from '@/lib/firestore'
import { filterNotes } from '@/lib/echo/view-helpers'
import { filterByCategory, noteCategories, previewText, relativeDate, sortByUpdated } from '@/lib/echo/notes-helpers'
import { groupByDay, localTimeZone } from '@/lib/echo/day-groups'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { isPersonTag, personLabelSet } from '@/lib/echo/glow'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { cn } from '@/lib/utils'
import { Alert, Button, EmptyState, IconButton, Input, PageHeader, Skeleton } from './ui'
import { useDay } from './use-day'
import { NoteEditor } from './note-editor'
import { KindTag } from './glow'
import { AskEcho } from './ask-echo'
import type { HomeView } from './home'

type NoteRow = Note & { id: string }

const updatedMs = (n: NoteRow) => (n.updatedAt ?? n.createdAt)?.toMillis?.() ?? Date.now()

const fullDate = (n: NoteRow) =>
  n.createdAt ? `Created ${n.createdAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Just now'

// One colour per known category (mockup: Personal blue, Ideas amber, Health green); others stay neutral.
const CATEGORY_COLOR: Record<string, string> = {
  personal: ORB_COLOR.note,
  ideas: ORB_COLOR.goal,
  health: ORB_COLOR.health,
  career: ORB_COLOR.interest,
  diary: 'var(--color-primary)',
}
const NEUTRAL = 'var(--color-muted-foreground)'
const categoryColor = (c: string) => CATEGORY_COLOR[c.trim().toLowerCase()] ?? NEUTRAL

function cardGlow(color: string): CSSProperties {
  return {
    background: `radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, ${color} 15%, transparent), transparent 55%), var(--color-surface)`,
    borderColor: `color-mix(in srgb, ${color} 22%, var(--color-border))`,
  }
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

const NO_PEOPLE = new Set<string>()
const WEEK_MS = 7 * 86_400_000

function NoteCard({ note, people, onOpen }: { note: NoteRow; people: Set<string>; onOpen: () => void }) {
  const preview = previewText(note.body)
  const color = categoryColor(note.category)
  return (
    <button
      type="button"
      onClick={onOpen}
      style={cardGlow(color)}
      className={`flex w-full flex-col rounded-2xl border px-4 py-3 text-left transition-[filter] hover:brightness-125 ${FOCUS_RING}`}
    >
      <span className="w-full truncate text-[15px] font-semibold text-foreground lg:text-sm">{note.title || 'Untitled'}</span>
      <span className={`mt-1 line-clamp-2 text-sm leading-5 ${preview ? 'text-muted-foreground' : 'text-subtle'}`}>{preview || 'No content yet'}</span>
      <span className="mt-2 flex w-full min-w-0 items-center gap-1.5 text-xs">
        <span className="shrink-0 font-medium" style={{ color }}>{note.category}</span>
        {note.tags.length > 0 && (
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {note.tags.slice(0, 3).map((t) =>
              isPersonTag(t, people) ? (
                <KindTag key={t} kind="person">{t}</KindTag>
              ) : (
                <span key={t} className="text-subtle">· {t}</span>
              ),
            )}
            {note.tags.length > 3 && <span className="text-subtle">+{note.tags.length - 3}</span>}
          </span>
        )}
        <span className="ml-auto shrink-0 text-subtle">{relativeDate(updatedMs(note), Date.now())}</span>
      </span>
    </button>
  )
}

export function NotesView({ uid, user, profile, onNavigate }: { uid: string; user: User; profile: UserProfile; onNavigate?: (view: HomeView) => void }) {
  const day = useDay()
  const [notes, setNotes] = useState<NoteRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [category, setCategory] = useState('All')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
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

  useEffect(() => {
    if (searching) searchRef.current?.focus()
  }, [searching])

  const categories = useMemo(() => noteCategories(notes ?? []), [notes])
  const activeCategory = category === 'All' || categories.some((c) => c.toLowerCase() === category.toLowerCase()) ? category : 'All'
  const visible = useMemo(() => filterByCategory(filterNotes(notes ?? [], search), activeCategory), [notes, search, activeCategory])
  // `day` recomputes the Today / Yesterday labels when the date rolls over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => groupByDay(visible, updatedMs, Date.now(), localTimeZone()), [visible, day])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const thisWeek = useMemo(() => (notes ?? []).filter((n) => (n.createdAt?.toMillis?.() ?? Date.now()) >= Date.now() - WEEK_MS).length, [notes, day])
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

  // If the open note disappears (deleted elsewhere), return to the list.
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
      setSearching(false)
      setCategory('All')
      open(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a note.')
    } finally {
      setCreating(false)
    }
  }

  const closeSearch = () => {
    setSearch('')
    setSearching(false)
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

  const count = notes?.length ?? 0
  const oneLiner = notes === null ? undefined : count === 0 ? 'Nothing saved yet' : `${count} ${count === 1 ? 'note' : 'notes'} · ${thisWeek} this week`
  const showSearch = searching || search !== ''

  return (
    <div ref={root} className="animate-in">
      <PageHeader
        title="Notes"
        description={oneLiner}
        action={
          <div className="flex justify-end gap-2">
            <IconButton icon={Search} label="Search notes" variant="secondary" aria-pressed={showSearch} onClick={() => (showSearch ? closeSearch() : setSearching(true))} />
            <IconButton icon={Plus} label="New blank note" variant="secondary" disabled={creating} onClick={() => void create()} />
          </div>
        }
      />
      {(error || loadError) && (
        <div className="mb-4">
          <Alert variant="danger">{error || loadError}</Alert>
        </div>
      )}
      <div className="grid gap-4">
        {showSearch && (
          <div className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input ref={searchRef} aria-label="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-11" placeholder="Search notes" />
            <button type="button" aria-label="Close search" onClick={closeSearch} className={`absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground ${FOCUS_RING}`}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        <AskEcho user={user} profile={profile} placeholder="Tell Echo something to remember" onNavigate={onNavigate} />
        {notes !== null && categories.length > 1 && (
          <div role="group" aria-label="Filter by category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
            {['All', ...categories].map((c) => {
              const on = c === activeCategory
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors lg:min-h-9',
                    on ? 'border-primary/40 bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                    FOCUS_RING,
                  )}
                >
                  {c !== 'All' && <span aria-hidden="true" className="size-2 rounded-full" style={{ background: categoryColor(c) }} />}
                  {c}
                </button>
              )
            })}
          </div>
        )}
        {notes === null ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No notes yet"
            description="Tell Echo something to remember above, or start a blank note."
            action={<Button icon={Plus} variant="secondary" onClick={() => void create()} loading={creating}>Blank note</Button>}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No notes found"
            description="Nothing matches your search or filter."
            action={<Button variant="secondary" onClick={() => { closeSearch(); setCategory('All') }}>Clear filters</Button>}
          />
        ) : (
          <div className="grid gap-5">
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h2 className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-widest text-subtle">{g.label}</h2>
                <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((n) => (
                    <li key={n.id}>
                      <NoteCard note={n} people={people} onOpen={() => open(n.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
