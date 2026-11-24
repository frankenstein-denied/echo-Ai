'use client'

import { useEffect, useMemo, useState } from 'react'
import { getCountFromServer, onSnapshot, query, Timestamp, where } from 'firebase/firestore'
import { diaryPagesCol, goalsCol, notesCol, remindersCol } from '@/lib/firestore'
import { dueTodayCount, weekStartMs, weekStrip, type WeekDay, type WeekPage } from '@/lib/echo/sidebar'
import { useDay } from './use-day'
import { useIsMobile } from './use-mobile'

type DueItem = { dueMs: number; done: boolean }

/** Average progress (0-100, rounded) over the given goals, or null with none. */
export function goalsPercent(progress: number[]): number | null {
  const ok = progress.filter((p) => Number.isFinite(p)).map((p) => Math.min(100, Math.max(0, p)))
  return ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null
}

/**
 * Live data for the sidebar: reminders due today (or overdue), this week's diary strip, the notes count and the
 * goals' average progress. The notes count is an aggregate (no doc reads per note), refreshed when `refreshKey`
 * changes (the shell passes the current view, so it catches up after Echo or the Notes page adds one).
 */
export function useSidebarData(uid: string | undefined, refreshKey?: string): { dueCount: number; week: WeekDay[]; notesCount: number | null; goalsPct: number | null } {
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

  const [notesCount, setNotesCount] = useState<number | null>(null)
  useEffect(() => {
    if (!uid || !enabled) {
      setNotesCount(null)
      return
    }
    let live = true
    getCountFromServer(notesCol(uid)).then(
      (snap) => live && setNotesCount(snap.data().count),
      (err) => console.warn('Echo: sidebar notes count failed', err),
    )
    return () => {
      live = false
    }
  }, [uid, enabled, refreshKey])

  const [goalsPct, setGoalsPct] = useState<number | null>(null)
  useEffect(() => {
    if (!uid || !enabled) {
      setGoalsPct(null)
      return
    }
    return onSnapshot(
      goalsCol(uid),
      (snap) => setGoalsPct(goalsPercent(snap.docs.map((d) => Number(d.data().progress)))),
      (err) => {
        console.error('Echo: sidebar goals listener failed', err)
        setGoalsPct(null)
      },
    )
  }, [uid, enabled])

  const dueCount = useMemo(() => dueTodayCount(reminders, new Date()), [reminders, day]) // eslint-disable-line react-hooks/exhaustive-deps
  const week = useMemo(() => weekStrip(pages, new Date()), [pages, day]) // eslint-disable-line react-hooks/exhaustive-deps
  return { dueCount, week, notesCount, goalsPct }
}
