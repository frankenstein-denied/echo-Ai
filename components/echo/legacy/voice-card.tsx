'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { getDocs, limit, orderBy, query } from 'firebase/firestore'
import { RefreshCw, X } from 'lucide-react'
import { diaryPagesCol, pageMessagesCol, type UserProfile } from '@/lib/firestore'
import { buildVoice } from '@/lib/echo/legacy-client'
import { getVoice, removeVoiceSample, saveVoice, type LegacyVoice } from '@/lib/legacy-store'
import { Alert, Button, Card, IconButton, Skeleton } from '../ui'

const MAX_LINES = 300
const PAGES_TO_READ = 30
const STALE_MS = 7 * 86_400_000

/** Up to 300 lines the owner typed (role 'user'), oldest first, from the latest diary pages. */
async function gatherOwnLines(uid: string): Promise<string[]> {
  const pages = await getDocs(query(diaryPagesCol(uid), orderBy('updatedAt', 'desc'), limit(PAGES_TO_READ)))
  const newestFirst: string[][] = []
  let total = 0
  for (const page of pages.docs) {
    if (total >= MAX_LINES) break
    const msgs = await getDocs(query(pageMessagesCol(uid, page.id), orderBy('createdAt', 'asc')))
    const lines = msgs.docs
      .map((d) => d.data())
      .filter((m) => m.role === 'user' && typeof m.text === 'string' && m.text.trim())
      .map((m) => m.text.trim())
    newestFirst.push(lines)
    total += lines.length
  }
  return newestFirst.reverse().flat().slice(-MAX_LINES)
}

function isStale(voice: LegacyVoice | null): boolean {
  const built = voice?.builtAt?.toMillis?.()
  return !voice || typeof built !== 'number' || Date.now() - built > STALE_MS
}

/** How Echo captured the owner's typing style, with removable samples and a Rebuild button. */
export function VoiceCard({ user, profile, enabled }: { user: User; profile: UserProfile; enabled: boolean }) {
  const uid = user.uid
  const [voice, setVoice] = useState<LegacyVoice | null | undefined>(undefined)
  const [building, setBuilding] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [error, setError] = useState('')
  const autoTried = useRef(false)
  const name = profile.preferredName || profile.displayName || ''

  useEffect(() => {
    let cancelled = false
    getVoice(uid)
      .then((v) => !cancelled && setVoice(v))
      .catch(() => {
        if (cancelled) return
        autoTried.current = true // don't overwrite a voice we couldn't read
        setVoice(null)
        setError("Couldn't load your voice profile.")
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  const rebuild = useCallback(async () => {
    setBuilding(true)
    setError('')
    try {
      const lines = await gatherOwnLines(uid)
      if (!lines.length) {
        setError('Chat with Echo in your diary first. Your voice is built from what you type there.')
        return
      }
      const v = await buildVoice(user, lines, name)
      await saveVoice(uid, { summary: v.summary, samples: v.samples, nicknames: v.nicknames, language: v.language || null })
      setVoice(await getVoice(uid))
    } catch (e) {
      setError(e instanceof Error && e.message ? `Couldn't build your voice. ${e.message}` : "Couldn't build your voice. Try again later.")
    } finally {
      setBuilding(false)
    }
  }, [uid, user, name])

  // Kept fresh while Legacy is on: built when missing or older than 7 days, once per visit.
  useEffect(() => {
    if (!enabled || voice === undefined || autoTried.current || !isStale(voice)) return
    autoTried.current = true
    void rebuild()
  }, [enabled, voice, rebuild])

  async function removeSample(i: number) {
    setRemoving(i)
    setError('')
    try {
      await removeVoiceSample(uid, i)
      setVoice(await getVoice(uid))
    } catch {
      setError("Couldn't remove that line. Try again.")
    } finally {
      setRemoving(null)
    }
  }

  const builtAt = voice?.builtAt?.toDate?.()

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Your voice</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How your legacy will type, learned from what you write in your diary. It updates every week while Legacy is on.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={RefreshCw} loading={building} onClick={() => void rebuild()}>
          Rebuild
        </Button>
      </div>
      {error && (
        <div className="mt-4">
          <Alert variant="warning">{error}</Alert>
        </div>
      )}
      {voice === undefined ? (
        <div className="mt-4 grid gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : !voice ? (
        <p className="mt-4 text-sm text-muted-foreground">{building ? 'Learning how you type…' : 'Not built yet.'}</p>
      ) : (
        <div className="mt-4 grid gap-4">
          {voice.summary && <p className="whitespace-pre-line text-sm text-foreground">{voice.summary}</p>}
          {voice.samples.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground">Lines it learned from</h3>
              <p className="text-xs text-muted-foreground">Remove any line you'd rather it didn't keep.</p>
              <ul className="mt-2 grid gap-1.5">
                {voice.samples.map((s, i) => (
                  <li key={`${i}-${s}`} className="flex items-start gap-2 rounded-lg bg-surface-2 py-1 pl-3 pr-1 text-sm text-foreground">
                    <span className="min-w-0 flex-1 break-words py-1.5">{s}</span>
                    <IconButton icon={X} size="sm" label="Remove this line" disabled={removing !== null || building} onClick={() => void removeSample(i)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {builtAt && <p className="text-xs text-muted-foreground">Built {builtAt.toLocaleDateString()}{voice.language ? ` · ${voice.language}` : ''}</p>}
        </div>
      )}
    </Card>
  )
}
