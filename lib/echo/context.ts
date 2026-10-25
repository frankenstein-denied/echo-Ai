import type { EchoRequest } from './types'

const PROFILE_MAX = 1500
const RECENT_MAX = 10
const RECENT_TEXT_MAX = 500
const LABELS_MAX = 40
const LABEL_LEN = 60
const CHECK_IN_PREFIX = 'Check-in time:'

/** Pull the check-in time ("Check-in time: HH:MM") out of the client-built profile summary. */
export function extractCheckInTime(profile: string): string {
  const m = /check-?in(?: time)?\s*[:=]\s*([01]?\d|2[0-3]):([0-5]\d)/i.exec(profile)
  if (!m) return '09:00'
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

type ProfileInput = {
  preferredName?: string
  tone?: string
  checkInTime?: string
  priorities?: string[]
  yearGoals?: string[]
  importantPeople?: string[]
}
type MessageInput = { role: 'user' | 'assistant'; text: string }
type MemoryInputLike = { label: string; type: string; mentions?: number; lastSeenAt?: { toMillis(): number } | null }

function listLine(name: string, items: string[] | undefined): string | null {
  const clean = (items ?? []).map((s) => s.trim()).filter(Boolean)
  return clean.length ? `${name}: ${clean.join(', ')}` : null
}

export function buildProfileSummary(profile: ProfileInput): string {
  const lines = [
    profile.preferredName?.trim() ? `Name: ${profile.preferredName.trim()}` : null,
    profile.tone?.trim() ? `Tone: ${profile.tone.trim()}` : null,
    // The router reads this exact line via extractCheckInTime.
    profile.checkInTime ? `${CHECK_IN_PREFIX} ${profile.checkInTime}` : null,
    listLine('Priorities', profile.priorities),
    listLine('Year goals', profile.yearGoals),
    listLine('Important people', profile.importantPeople),
  ].filter((l): l is string => !!l)
  // Over the cap: drop the last non-check-in line until it fits.
  while (lines.join('\n').length > PROFILE_MAX) {
    let idx = lines.length - 1
    while (idx >= 0 && lines[idx].startsWith(CHECK_IN_PREFIX)) idx--
    if (idx < 0) break
    lines.splice(idx, 1)
  }
  return lines.join('\n').slice(0, PROFILE_MAX)
}

export function buildContext(profile: ProfileInput, messages: MessageInput[], memories: MemoryInputLike[]): EchoRequest['context'] {
  const recentMessages = messages
    .filter((m) => m.text.trim())
    .slice(-RECENT_MAX)
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, RECENT_TEXT_MAX) }))
  const memoryLabels = [...memories]
    .filter((m) => m.label.trim())
    .sort((a, b) => (b.mentions ?? 1) - (a.mentions ?? 1) || (b.lastSeenAt?.toMillis() ?? 0) - (a.lastSeenAt?.toMillis() ?? 0))
    .slice(0, LABELS_MAX)
    .map((m) => ({ label: m.label.trim().slice(0, LABEL_LEN), type: m.type, mentions: m.mentions ?? 1 }))
  return { profile: buildProfileSummary(profile), recentMessages, memoryLabels }
}
