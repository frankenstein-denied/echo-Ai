'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { FileText, Plus, Search, Trash2 } from 'lucide-react'
import { addNote, deleteNote, notesCol, updateNote, type Note } from '@/lib/firestore'
import { debounce, filterNotes, parseTags, type Debounced } from '@/lib/echo/view-helpers'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Skeleton } from './ui'

type NoteRow = Note & { id: string }

const dateText = (n: NoteRow) =>
  n.createdAt ? n.createdAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Just now'

function NoteEditor({ uid, note, onDeleted }: { uid: string; note: NoteRow; onDeleted: () => void }) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [tagText, setTagText] = useState(note.tags.join(', '))
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const saver = useRef<Debounced<[string, string, string]> | null>(null)

  useEffect(() => {
    const s = debounce(async (t: string, b: string, tg: string) => {
      try {
        await updateNote(uid, note.id, { title: t, body: b, tags: parseTags(tg) })
        setStatus('saved')
        setError('')
      } catch (e) {
        setStatus('error')
        setError(e instanceof Error ? e.message : 'Could not save this note.')
      }
    }, 800)
    saver.current = s
    return () => s.flush()
  }, [uid, note.id])

  const change = (t: string, b: string, tg: string) => {
    setStatus('saving')
    saver.current?.(t, b, tg)
  }

  const remove = async () => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return
    saver.current?.cancel()
    try {
      await deleteNote(uid, note.id)
      onDeleted()
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Could not delete this note.')
    }
  }

  return (
    <Card className="flex flex-col">
      <input
        aria-label="Note title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          change(e.target.value, body, tagText)
        }}
        placeholder="Title"
        maxLength={500}
        className="w-full rounded-md bg-transparent text-2xl font-semibold leading-8 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {note.category} · {dateText(note)} · {status === 'saving' ? 'Saving...' : status === 'error' ? 'Not saved' : 'Saved'}
      </p>
      <textarea
        aria-label="Note body"
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          change(title, e.target.value, tagText)
        }}
        placeholder="Write something..."
        className="mt-6 min-h-[320px] w-full resize-none rounded-md bg-transparent text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      {error && (
        <div className="mb-3">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {parseTags(tagText).map((t) => (
          <Badge key={t} variant="neutral">{t}</Badge>
        ))}
        <input
          aria-label="Tags, comma separated"
          value={tagText}
          onChange={(e) => {
            setTagText(e.target.value)
            change(title, body, e.target.value)
          }}
          placeholder="tags, comma separated"
          className="min-w-[160px] flex-1 rounded-md bg-transparent px-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <Button variant="danger" size="sm" icon={Trash2} onClick={remove} className="ml-auto">
          Delete
        </Button>
      </div>
    </Card>
  )
}

export function NotesView({ uid }: { uid: string }) {
  const [notes, setNotes] = useState<NoteRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const q = query(notesCol(uid), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        setNotes(snap.docs.map((s) => ({ ...s.data({ serverTimestamps: 'estimate' }), id: s.id })))
        setLoadError('')
      },
      (e) => {
        setNotes([])
        setLoadError(e.message || 'Could not load your notes.')
      },
    )
  }, [uid])

  const visible = useMemo(() => filterNotes(notes ?? [], search), [notes, search])
  const selected = notes?.find((n) => n.id === selectedId) ?? visible[0] ?? null

  const create = async () => {
    setCreating(true)
    setError('')
    try {
      const id = await addNote(uid, { title: 'Untitled note', body: '', category: 'Diary', tags: [] })
      setSearch('')
      setSelectedId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a note.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="animate-in">
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
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="self-start">
          <div className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
            <Input aria-label="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search notes" />
          </div>
          <div className="mt-4 flex flex-col gap-1">
            {notes === null ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)
            ) : visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {notes.length === 0 ? 'No notes yet. Create one or tell Echo something to remember.' : 'No notes match your search.'}
              </p>
            ) : (
              visible.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  aria-current={selected?.id === n.id ? 'true' : undefined}
                  className={`rounded-lg border p-3 text-left ${FOCUS_RING} ${selected?.id === n.id ? 'border-primary/40 bg-primary-soft' : 'border-transparent hover:bg-surface-2'}`}
                >
                  <p className="truncate text-sm font-medium text-foreground">{n.title || 'Untitled'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.category} · {dateText(n)}
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>
        {selected ? (
          <NoteEditor key={selected.id} uid={uid} note={selected} onDeleted={() => setSelectedId(null)} />
        ) : notes === null ? (
          <Skeleton className="h-96" />
        ) : (
          <EmptyState icon={FileText} title="No note selected" description="Select a note, or create a new one." />
        )}
      </div>
    </div>
  )
}
