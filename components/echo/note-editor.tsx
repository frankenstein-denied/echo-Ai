'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Loader2, MoreHorizontal, Trash2, TriangleAlert } from 'lucide-react'
import { deleteNote, updateNote } from '@/lib/firestore'
import { debounce, parseTags, type Debounced } from '@/lib/echo/view-helpers'
import { categoryOptions } from '@/lib/echo/notes-helpers'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Alert, Badge, Button, IconButton, Input, Select } from './ui'
import { Sheet, SheetItem } from './sheet'

export type EditableNote = { id: string; title: string; body: string; category: string; tags: string[] }

type Fields = [string, string, string, string]

export function NoteEditor({ uid, note, categories, dateLabel, onBack }: { uid: string; note: EditableNote; categories: string[]; dateLabel: string; onBack: () => void }) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [category, setCategory] = useState(note.category)
  const [tagText, setTagText] = useState(note.tags.join(', '))
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const [actions, setActions] = useState(false)
  const touched = useRef(new Set<string>())
  const saver = useRef<Debounced<Fields> | null>(null)

  useEffect(() => {
    const s = debounce(async (t: string, b: string, tg: string, c: string) => {
      try {
        await updateNote(uid, note.id, { title: t, body: b, tags: parseTags(tg), category: c })
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

  // Adopt live changes (e.g. made by Echo) for fields the user has not edited since opening.
  const tagsKey = note.tags.join(', ')
  useEffect(() => {
    if (!touched.current.has('title')) setTitle(note.title)
    if (!touched.current.has('body')) setBody(note.body)
    if (!touched.current.has('category')) setCategory(note.category)
    if (!touched.current.has('tags')) setTagText(tagsKey)
  }, [note.title, note.body, note.category, tagsKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target
      if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === 'date')) return
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const change = (t: string, b: string, tg: string, c: string) => {
    setStatus('saving')
    saver.current?.(t, b, tg, c)
  }

  // The mobile actions sheet is itself the confirmation step.
  const remove = async (confirmed = false) => {
    if (!confirmed && !window.confirm('Delete this note? This cannot be undone.')) return
    saver.current?.cancel()
    try {
      await deleteNote(uid, note.id)
      onBack()
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Could not delete this note.')
    }
  }

  const StatusIcon = status === 'saving' ? Loader2 : status === 'error' ? TriangleAlert : Check
  const tags = parseTags(tagText)

  return (
    // Below lg the editor is a full-screen layer (covers the title and tab bars) with a sticky top bar.
    <div className="animate-in max-lg:fixed max-lg:inset-0 max-lg:z-[45] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:bg-background max-lg:pb-[env(safe-area-inset-bottom)]">
      <div className="mb-6 flex items-center justify-between gap-3 max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:mb-0 max-lg:border-b max-lg:border-border max-lg:bg-background max-lg:px-2 max-lg:pb-1 max-lg:pt-[calc(env(safe-area-inset-top)+4px)]">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} aria-label="All notes" className="max-lg:px-2">All notes</Button>
        <div className="flex items-center gap-3 max-lg:gap-1">
          <span role="status" className={`inline-flex items-center gap-1.5 text-xs ${status === 'error' ? 'text-danger' : 'text-muted-foreground'}`}>
            <StatusIcon size={14} aria-hidden="true" className={status === 'saving' ? 'animate-spin' : ''} />
            {status === 'saving' ? 'Saving...' : status === 'error' ? 'Not saved' : 'Saved'}
          </span>
          <Button variant="danger" size="sm" icon={Trash2} onClick={() => void remove()} className="max-lg:hidden">Delete</Button>
          <IconButton icon={MoreHorizontal} label="Note actions" className="lg:hidden" aria-haspopup="dialog" aria-expanded={actions} onClick={() => setActions(true)} />
        </div>
      </div>
      <Sheet open={actions} onClose={() => setActions(false)} title={title.trim() || 'Untitled'} description="Deleting a note cannot be undone.">
        <SheetItem
          icon={Trash2}
          label="Delete note"
          tone="danger"
          onClick={() => {
            setActions(false)
            void remove(true)
          }}
        />
      </Sheet>
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-surface p-6 sm:p-8 max-lg:rounded-none max-lg:border-0 max-lg:bg-background max-lg:px-4 max-lg:pb-8 max-lg:pt-5">
        <input
          aria-label="Note title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            touched.current.add('title')
            change(e.target.value, body, tagText, category)
          }}
          placeholder="Title"
          maxLength={500}
          className={`w-full rounded-md bg-transparent text-2xl font-semibold leading-8 text-foreground placeholder:text-muted-foreground max-lg:py-2 ${FOCUS_RING}`}
        />
        <p className="mt-2 text-xs text-muted-foreground">{dateLabel}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr]">
          <Select
            label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
            touched.current.add('category')
              change(title, body, tagText, e.target.value)
            }}
          >
            {categoryOptions(categories, category).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <div>
            <Input
              label="Tags"
              value={tagText}
              onChange={(e) => {
                setTagText(e.target.value)
            touched.current.add('tags')
                change(title, body, e.target.value, category)
              }}
              placeholder="tags, comma separated"
            />
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="neutral">{t}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <textarea
          aria-label="Note body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            touched.current.add('body')
            change(title, e.target.value, tagText, category)
          }}
          placeholder="Write something..."
          className={`mt-6 min-h-[360px] w-full resize-y max-lg:min-h-[50dvh] max-lg:resize-none rounded-md bg-transparent text-base leading-7 text-foreground placeholder:text-muted-foreground ${FOCUS_RING}`}
        />
        {error && (
          <div className="mt-4">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}
      </div>
    </div>
  )
}
