'use client'

import { useEffect, useMemo, useState } from 'react'
import { onSnapshot, query, Timestamp, where } from 'firebase/firestore'
import { diaryPagesCol, remindersCol } from '@/lib/firestore'
import { dueTodayCount, weekStartMs, weekStrip, type WeekDay, type WeekPage } from '@/lib/echo/sidebar'
import { useDay } from './use-day'
import { useIsMobile } from './use-mobile'

type DueItem = { dueMs: number; done: boolean }

/** Live data for the sidebar: reminders due today (or overdue) and this week's diary strip. */
export function useSidebarData(uid: string | undefined): { dueCount: number; week: WeekDay[] } {
  const day = useDay()
  // The sidebar is hidden below lg, so no listeners are attached there.
  const enabled = !useIsMobile()
  const [reminders, setReminders] = useState<DueItem[]>([])
  const [pages, setPages] = useState<WeekPage[]>([])

  useEffect(() => {
    if (!uid || !enabled) {
      setReminders([])
      return
    }
    return onSnapshot(
      query(remindersCol(uid), where('done', '==', false)),
      (snap) =>
        setReminders(
          snap.docs
            .map((d) => ({ dueMs: d.data({ serverTimestamps: 'estimate' }).dueAt?.toMillis?.() as number, done: false }))
            .filter((r) => Number.isFinite(r.dueMs)),
        ),
      (err) => {
        console.error('Echo: sidebar reminders listener failed', err)
        setReminders([])
      },
    )
  }, [uid, enabled])

  // `day` changes when the local day rolls over; re-subscribe so the query covers the current week.
  useEffect(() => {
    if (!uid || !enabled) {
      setPages([])
      return
    }
    const start = Timestamp.fromMillis(weekStartMs(new Date()))
    return onSnapshot(
      query(diaryPagesCol(uid), where('lastMessageAt', '>=', start)),
      (snap) =>
        setPages(
          snap.docs.map((d) => {
            const p = d.data({ serverTimestamps: 'estimate' })
            return {
              id: d.id,
              mix: p.mix,
              createdMs: p.createdAt?.toMillis() ?? null,
              lastMs: p.lastMessageAt?.toMillis() ?? null,
              messageCount: p.messageCount,
            }
          }),
        ),
      (err) => {
        console.error('Echo: sidebar diary listener failed', err)
        setPages([])
      },
    )
  }, [uid, day, enabled])

  const dueCount = useMemo(() => dueTodayCount(reminders, new Date()), [reminders, day]) // eslint-disable-line react-hooks/exhaustive-deps
  const week = useMemo(() => weekStrip(pages, new Date()), [pages, day]) // eslint-disable-line react-hooks/exhaustive-deps
  return { dueCount, week }
}
