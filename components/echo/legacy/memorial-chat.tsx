'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { ArrowLeft, Send } from 'lucide-react'
import type { UserProfile } from '@/lib/firestore'
import { LEGACY_KINDS } from '@/lib/echo/legacy'
import { bubbleDelayMs, chatSendGate, historyForRequest, initialOf, RELOCKED_MESSAGE } from '@/lib/echo/legacy-chat-helpers'
import { askMemorial } from '@/lib/echo/legacy-client'
import { buildLegacyContext, toVoiceProfile } from '@/lib/echo/legacy-prompt'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { addLegacyChatMessage, canReadLegacy, loadSharedLegacy, watchLegacyChat, type SharedLegacy } from '@/lib/legacy-store'
import { Alert, Badge, Button, IconButton, Skeleton } from '../ui'
import { BrowseMemories } from './browse-memories'

type ChatMsg = { id: string; role: 'user' | 'assistant'; text: string }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function gentleError(e: unknown): string {
  const msg = e instanceof Error ? e.message : ''
  if (msg === 'Please sign in again.' || msg === 'Echo is resting for a bit. Try again later.') return msg
  return "Couldn't reach Echo just now. Try again in a moment."
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-foreground ${small ? 'size-8 text-xs' : 'size-10 text-sm'}`}
      style={{ background: 'color-mix(in srgb, #f0a6c9 30%, var(--color-surface-2))' }}
    >
      {initialOf(name)}
    </div>
  )
}

/**
 * The memorial chat: messaging the owner as remembered by Echo. Replies arrive as separate bubbles, each after
 * "<name> is typing…". An inheritor's history is stored in their own space; a preview stores nothing.
 */
export function MemorialChat({
  user,
  ownerUid,
  ownerName,
  inheritorName,
  shared,
  preview = false,
  onBack,
}: {
  user: User
  ownerUid: string
  ownerName: string
  inheritorName: string
  shared: SharedLegacy
  preview?: boolean
  onBack: () => void
}) {
  const [messages, setMessages] = useState<ChatMsg[] | null>(preview ? [] : null)
  const [listenError, setListenError] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  const [locked, setLocked] = useState(false)
  const context = useMemo(() => buildLegacyContext(shared), [shared])
  const voice = useMemo(() => toVoiceProfile(shared.voice), [shared])
  const messagesRef = useRef<ChatMsg[]>([])
  messagesRef.current = messages ?? []
  const alive = useRef(true)
  const seq = useRef(0)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (preview) return
    return watchLegacyChat(
      user.uid,
      ownerUid,
      (msgs) => {
        setMessages(msgs.map((m) => ({ id: m.id, role: m.role, text: m.text })))
        setListenError('')
      },
      () => {
        setMessages([])
        setListenError("Couldn't load your earlier messages.")
      },
    )
  }, [preview, user.uid, ownerUid])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, typing, browsing])

  async function append(role: ChatMsg['role'], text: string): Promise<void> {
    if (preview) {
      const id = `p${++seq.current}`
      if (alive.current) setMessages((prev) => [...(prev ?? []), { id, role, text }])
      return
    }
    await addLegacyChatMessage(user.uid, ownerUid, role, text)
  }

  async function send() {
    const text = draft.trim()
    if (!text || busy || locked) return
    setBusy(true)
    setError('')
    if (!preview) {
      // The owner may have come back since this chat opened; the rules then deny the profile copy.
      const readable = await canReadLegacy(ownerUid).catch(() => 'unknown' as const)
      if (chatSendGate(readable) === 'locked') {
        if (alive.current) {
          setLocked(true)
          setBusy(false)
        }
        return
      }
    }
    const history = historyForRequest(messagesRef.current)
    setDraft('')
    try {
      await append('user', text)
    } catch {
      if (alive.current) {
        setDraft(text)
        setError("Couldn't send that. Try again.")
        setBusy(false)
      }
      return
    }
    setTyping(true)
    let bubbles: string[]
    try {
      bubbles = await askMemorial(user, { ownerName, inheritorName, voice, context, history, message: text })
    } catch (e) {
      if (alive.current) {
        setTyping(false)
        setError(gentleError(e))
        setBusy(false)
      }
      return
    }
    for (const bubble of bubbles) {
      // After leaving the chat, the rest of the reply is still saved, just without the typing pause.
      if (alive.current) {
        setTyping(true)
        await sleep(bubbleDelayMs(bubble))
      }
      try {
        await append('assistant', bubble)
      } catch {
        if (alive.current) setError("Couldn't save the reply. Try again.")
        break
      }
    }
    if (alive.current) {
      setTyping(false)
      setBusy(false)
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  if (browsing) return <BrowseMemories ownerName={ownerName} shared={shared} onBack={() => setBrowsing(false)} />

  const list = messages ?? []
  return (
    <div className="grid gap-3">
      <section aria-label={`Chat with ${ownerName}`} className="flex h-[min(760px,calc(100dvh-10rem))] min-h-[420px] flex-col rounded-xl border border-border bg-surface">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          <IconButton icon={ArrowLeft} label="Back to Legacy" onClick={onBack} />
          <Avatar name={ownerName} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">{ownerName}</p>
              {preview && <Badge variant="info">Preview · everything you&apos;ve shared with Echo</Badge>}
            </div>
            <button
              type="button"
              onClick={() => setInfo((v) => !v)}
              aria-expanded={info}
              aria-controls="legacy-chat-info"
              className={`touch-hit block max-w-full truncate rounded text-left text-xs text-muted-foreground hover:text-foreground ${FOCUS_RING}`}
            >
              ✨ remembered by Echo · tap for info
            </button>
          </div>
        </header>
        {info && (
          <div id="legacy-chat-info" className="shrink-0 border-b border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
            <p>
              This is an AI made by Echo from what {ownerName} shared. It can be wrong, and it won&apos;t make up memories {ownerName} never shared.
            </p>
            {preview && <p className="mt-1 text-xs text-muted-foreground">This is a preview with everything you&apos;ve shared. Nothing here is saved.</p>}
          </div>
        )}

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="mx-auto flex max-w-[640px] flex-col">
            {listenError && <Alert variant="danger">{listenError}</Alert>}
            {messages === null && !listenError && <Skeleton className="h-12 w-2/3" />}
            {messages !== null && !list.length && !typing && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {preview ? 'This is how your legacy answers. Nothing here is saved.' : `Say hi to ${ownerName}.`}
              </p>
            )}
            {list.map((m, i) => {
              const prev = list[i - 1]
              const groupStart = !prev || prev.role !== m.role
              if (m.role === 'user') {
                return (
                  <div key={m.id} className={`flex justify-end ${groupStart ? 'mt-4 first:mt-0' : 'mt-1'}`}>
                    <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-sm text-foreground max-lg:px-3.5 max-lg:text-[15px] max-lg:leading-[22px]">
                      {m.text}
                    </div>
                  </div>
                )
              }
              return (
                <div key={m.id} className={`flex items-end gap-2 ${groupStart ? 'mt-4 first:mt-0' : 'mt-1'}`}>
                  {groupStart ? <Avatar name={ownerName} small /> : <span aria-hidden="true" className="w-8 shrink-0" />}
                  <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-surface-2 px-4 py-2.5 text-sm leading-6 text-foreground max-lg:px-3.5 max-lg:text-[15px] max-lg:leading-[22px]">
                    {m.text}
                  </div>
                </div>
              )
            })}
            <div aria-live="polite" className="mt-3 min-h-5">
              {typing && (
                <p className="flex items-center gap-2 pl-10 text-xs text-muted-foreground">
                  <span aria-hidden="true" className="animate-pulse">•••</span>
                  {ownerName} is typing…
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border p-3">
          {locked ? (
            <div className="mb-2">
              <Alert variant="info">{RELOCKED_MESSAGE}</Alert>
            </div>
          ) : (
            error && (
              <div className="mb-2">
                <Alert variant="warning">{error}</Alert>
              </div>
            )
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={2000}
              aria-label={`Message ${ownerName}`}
              placeholder={`Message ${ownerName}`}
              disabled={messages === null || locked}
              className={`max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-input-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50 max-lg:min-h-11 max-lg:text-[15px] ${FOCUS_RING}`}
            />
            <IconButton icon={Send} label="Send" variant="primary" onClick={() => void send()} disabled={busy || locked || !draft.trim()} />
          </div>
        </div>
      </section>
      <div>
        <Button variant="secondary" size="sm" onClick={() => setBrowsing(true)}>
          📖 Browse {ownerName}&apos;s memories
        </Button>
      </div>
    </div>
  )
}

/** The owner's own data, shaped like what an inheritor would see with every kind shared. Nothing is written. */
async function loadPreviewLegacy(uid: string, profile: UserProfile): Promise<SharedLegacy> {
  const shared = await loadSharedLegacy(uid, [...LEGACY_KINDS])
  return {
    ...shared,
    profile: {
      displayName: profile.displayName ?? null,
      preferredName: profile.preferredName ?? '',
      importantPeople: profile.importantPeople ?? [],
      tone: profile.tone ?? '',
      language: profile.language ?? null,
      updatedAt: Timestamp.now(),
    },
  }
}

/** "Talk to my legacy": the owner chats with their own memorial. */
export function PreviewChat({ user, profile, onBack }: { user: User; profile: UserProfile; onBack: () => void }) {
  const [shared, setShared] = useState<SharedLegacy | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  // Read once per attempt; profile edits elsewhere don't reload an open preview.
  const profileRef = useRef(profile)
  profileRef.current = profile
  const name = profile.preferredName?.trim() || profile.displayName?.trim() || user.displayName?.trim() || 'You'

  useEffect(() => {
    let cancelled = false
    setError('')
    loadPreviewLegacy(user.uid, profileRef.current)
      .then((s) => !cancelled && setShared(s))
      .catch(() => !cancelled && setError("Couldn't load your memories for the preview."))
    return () => {
      cancelled = true
    }
  }, [user.uid, attempt])

  if (error) {
    return (
      <div className="grid gap-3">
        <div>
          <IconButton icon={ArrowLeft} label="Back to Legacy" onClick={onBack} />
        </div>
        <Alert variant="danger">{error}</Alert>
        <div>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      </div>
    )
  }
  if (!shared) return <Skeleton className="h-[420px] w-full" />
  return <MemorialChat user={user} ownerUid={user.uid} ownerName={name} inheritorName="" shared={shared} preview onBack={onBack} />
}
