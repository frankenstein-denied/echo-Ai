import type { User } from 'firebase/auth'
import { addGoal, addPageMessage, addNote, addReminder, upsertHealthLog, upsertMemories, type EchoCategory } from '@/lib/firestore'
import type { EchoRequest, EchoResponse } from './types'
import { deriveCategory, fallbackReply, fetchWithTimeout } from './send-helpers'

export function localIsoWithOffset(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off < 0 ? '-' : '+'
  const abs = Math.abs(off)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export async function sendToEcho(user: User, text: string, context: EchoRequest['context']): Promise<EchoResponse> {
  const token = await user.getIdToken()
  const body: EchoRequest = {
    text,
    clientTime: localIsoWithOffset(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    context,
  }
  const res = await fetchWithTimeout('/api/echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(res.status === 401 ? 'Please sign in again.' : `Echo is unavailable (${res.status}).`)
  const data = (await res.json()) as Partial<EchoResponse>
  return {
    reply: typeof data.reply === 'string' ? data.reply : '',
    actions: Array.isArray(data.actions) ? data.actions : [],
    memories: Array.isArray(data.memories) ? data.memories : [],
    trace: Array.isArray(data.trace) ? data.trace : [],
    ...(data.error ? { error: true } : {}),
  }
}

export type SavedItem = { type: EchoCategory | 'memory'; label: string }
export type ApplyResult = { saved: SavedItem[]; failed: string[]; category: EchoCategory; reply: string; messageId?: string }

// Saves the assistant message; returns its id or undefined on failure.
export async function saveReply(uid: string, pageId: string, reply: string, category: EchoCategory): Promise<string | undefined> {
  try {
    return await addPageMessage(uid, pageId, 'assistant', reply, category)
  } catch (e) {
    console.error('Echo: could not save reply', e)
    return undefined
  }
}

// Applies actions and memories; a failure in one never blocks the others. Saves the assistant message last.
export async function applyEchoResponse(uid: string, pageId: string, res: EchoResponse): Promise<ApplyResult> {
  const saved: SavedItem[] = []
  const failed: string[] = []
  const run = async (type: SavedItem['type'], label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      saved.push({ type, label })
    } catch (e) {
      console.error(`Echo: could not save ${type}`, e)
      failed.push(type === 'memory' ? label : `${type}: ${label}`)
    }
  }
  for (const a of res.actions) {
    switch (a.type) {
      case 'note':
        await run('note', a.title, () => addNote(uid, { title: a.title, body: a.body, category: a.category, tags: a.tags }))
        break
      case 'goal':
        await run('goal', a.title, () => addGoal(uid, { title: a.title, category: a.category, targetDate: a.targetDate }))
        break
      case 'health': {
        const { date, mood, sleepMinutes, waterGlasses, energy } = a
        const fields = {
          ...(mood !== undefined ? { mood } : {}),
          ...(sleepMinutes !== undefined ? { sleepMinutes } : {}),
          ...(waterGlasses !== undefined ? { waterGlasses } : {}),
          ...(energy !== undefined ? { energy } : {}),
        }
        if (Object.keys(fields).length === 0) break
        await run('health', date, () => upsertHealthLog(uid, date, fields))
        break
      }
      case 'reminder': {
        const due = new Date(a.dueAt)
        if (Number.isNaN(due.getTime())) {
          failed.push(`reminder: ${a.title}`)
          break
        }
        await run('reminder', a.title, () => addReminder(uid, { title: a.title, dueAt: due, source: 'chat' }))
        break
      }
      case 'connector':
        // No connector backend yet: shown as a badge only.
        saved.push({ type: 'connector', label: a.provider })
        break
      default:
        break
    }
  }
  if (res.memories.length) await run('memory', '2nd Brain memories', () => upsertMemories(uid, res.memories))
  const category = deriveCategory(saved)
  const reply = res.reply || fallbackReply(saved)
  let messageId: string | undefined
  if (reply) {
    messageId = await saveReply(uid, pageId, reply, category)
    if (!messageId) failed.push('reply')
  }
  return { saved, failed, category, reply, messageId }
}
