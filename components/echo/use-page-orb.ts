'use client'

import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, query, where } from 'firebase/firestore'
import { diaryPagesCol, memoriesCol, type DiaryPage } from '@/lib/firestore'
import { buildOrbs, type Orb, type OrbMemory } from '@/lib/echo/orbs'
import { emptyPageOrb, TODAY_ORB_RADIUS } from '@/lib/echo/today-orb'

type Live = { pageId: string; page: (DiaryPage & { id: string }) | null; memories: OrbMemory[]; failed: boolean }

/**
 * Live orb for one diary page: the page doc (mix, messageCount) plus the memories linked to it.
 * A new page may have no doc yet (pages are created lazily), so this falls back to an empty pearl orb.
 */
export function usePageOrb(uid: string, pageId: string | undefined): Orb {
  const [live, setLive] = useState<Live | null>(null)

  useEffect(() => {
    if (!pageId) return
    setLive({ pageId, page: null, memories: [], failed: false })
    const patch = (p: Partial<Live>) => setLive((cur) => (cur && cur.pageId === pageId ? { ...cur, ...p } : cur))
    const onErr = (e: unknown) => {
      console.error('page orb listener', e)
      patch({ failed: true })
    }
    const unsubPage = onSnapshot(
      doc(diaryPagesCol(uid), pageId),
      (snap) => patch({ page: snap.exists() ? { ...snap.data({ serverTimestamps: 'estimate' }), id: snap.id } : null }),
      onErr,
    )
    const unsubMem = onSnapshot(
      query(memoriesCol(uid), where('pages', 'array-contains', pageId)),
      (snap) => patch({ memories: snap.docs.map((d) => ({ ...d.data(), id: d.id })) }),
      onErr,
    )
    return () => {
      unsubPage()
      unsubMem()
    }
  }, [uid, pageId])

  return useMemo(() => {
    const empty = emptyPageOrb(pageId ?? 'new')
    if (!pageId || !live || live.pageId !== pageId || live.failed || !live.page) return empty
    const p = live.page
    const orb = buildOrbs(live.memories, [
      { id: p.id, title: p.title, lastMessageMs: p.lastMessageAt?.toMillis?.(), messageCount: p.messageCount, mix: p.mix },
    ])[0]
    return orb ? { ...orb, radius: TODAY_ORB_RADIUS } : empty
  }, [pageId, live])
}
