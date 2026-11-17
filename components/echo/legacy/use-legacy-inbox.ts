'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { legacyBadgeCount, legacySeenKey } from '@/lib/echo/legacy-chat-helpers'
import { isReleased, watchMyLegacies, type LegacyLink } from '@/lib/legacy-store'

/**
 * The inheritor's Legacy inbox: links naming this user, which accepted ones are released right now,
 * and which released ones this device has already announced. One subscription for the whole app
 * (the shell provides it); release is checked per accepted link on load and when the app comes back into view.
 */
export type LegacyInbox = {
  links: LegacyLink[] | null
  error: string
  /** Owner uids of accepted links that are released right now. */
  released: string[]
  /** True once release has been checked for the current accepted links. */
  releaseChecked: boolean
  /** Released owner uids this device has already shown. */
  seen: string[]
  markSeen: (ownerUid: string) => void
  /** A released legacy the home banner asked the Legacy page to open. */
  openRequest: string | null
  requestOpen: (ownerUid: string | null) => void
  badge: number
}

const RECHECK_MIN_MS = 30_000

function readSeen(ownerUid: string): boolean {
  try {
    return globalThis.localStorage?.getItem(legacySeenKey(ownerUid)) === '1'
  } catch {
    return false
  }
}

function writeSeen(ownerUid: string, seen: boolean): void {
  try {
    if (seen) globalThis.localStorage?.setItem(legacySeenKey(ownerUid), '1')
    else globalThis.localStorage?.removeItem(legacySeenKey(ownerUid))
  } catch {
    // Storage blocked: the banner may show again next time.
  }
}

export function useLegacyInboxState(uid: string | undefined): LegacyInbox {
  const [links, setLinks] = useState<LegacyLink[] | null>(null)
  const [error, setError] = useState('')
  const [released, setReleased] = useState<string[]>([])
  const [checkedKey, setCheckedKey] = useState<string | null>(null)
  const [seen, setSeen] = useState<string[]>([])
  const [openRequest, setOpenRequest] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) {
      setLinks(null)
      return
    }
    return watchMyLegacies(
      uid,
      (l) => {
        setLinks(l)
        setError('')
      },
      () => {
        setLinks([])
        setError("Couldn't load the legacies left to you.")
      },
    )
  }, [uid])

  const acceptedKey = useMemo(
    () =>
      (links ?? [])
        .filter((l) => l.status === 'accepted')
        .map((l) => l.ownerUid)
        .sort()
        .join(','),
    [links],
  )

  const lastCheck = useRef(0)
  useEffect(() => {
    const owners = acceptedKey ? acceptedKey.split(',') : []
    let cancelled = false
    const check = async () => {
      lastCheck.current = Date.now()
      const results = await Promise.all(owners.map((o) => isReleased(o).then((r) => [o, r] as const, () => [o, null] as const)))
      if (cancelled) return
      setReleased((prev) => {
        const next = results.filter(([o, r]) => r === true || (r === null && prev.includes(o))).map(([o]) => o)
        return next.length === prev.length && next.every((o) => prev.includes(o)) ? prev : next
      })
      // A legacy that locked again (the owner came back) is announced again when it is next released.
      for (const [o, r] of results) if (r === false) writeSeen(o, false)
      setSeen(owners.filter((o) => readSeen(o)))
      setCheckedKey(acceptedKey)
    }
    void check()
    if (!owners.length) return () => { cancelled = true }
    const again = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current >= RECHECK_MIN_MS) void check()
    }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('focus', again)
    }
  }, [acceptedKey])

  const markSeen = useCallback((ownerUid: string) => {
    writeSeen(ownerUid, true)
    setSeen((prev) => (prev.includes(ownerUid) ? prev : [...prev, ownerUid]))
  }, [])

  const pending = (links ?? []).filter((l) => l.status === 'pending').length
  const badge = legacyBadgeCount(pending, released, seen)

  return useMemo(
    () => ({ links, error, released, releaseChecked: checkedKey === acceptedKey, seen, markSeen, openRequest, requestOpen: setOpenRequest, badge }),
    [links, error, released, checkedKey, acceptedKey, seen, markSeen, openRequest, badge],
  )
}

export const LegacyInboxContext = createContext<LegacyInbox | null>(null)

/** The shell's inbox; null outside it (for example the floating Echo window). */
export function useLegacyInbox(): LegacyInbox | null {
  return useContext(LegacyInboxContext)
}
