// Call connect timings, reported to the server so slow starts can be measured on real phones without logcat.
// Only fixed step names and milliseconds since the page started (performance.now()) leave the device: no content.

export const TIMING_STEPS = [
  'home mounted',
  'prefs loaded',
  'memories loaded',
  'messages loaded',
  'tap',
  'mic ready',
  'session token',
  'websocket open',
  'listening',
  'first audio ready',
] as const
export type TimingStep = (typeof TIMING_STEPS)[number]

/** float: the notification's Talk / chathead call (its own fresh page). app: the Call button inside the app. */
export const TIMING_ENTRIES = ['float', 'app'] as const
export const TIMING_OUTCOMES = ['first_audio', 'failed'] as const
export type TimingReport = { entry: (typeof TIMING_ENTRIES)[number]; outcome: (typeof TIMING_OUTCOMES)[number]; marks: [TimingStep, number][] }

export const TIMING_LIMITS = { marks: 20, maxMs: 600_000, bodyBytes: 4096 } as const

const STEP_SET = new Set<string>(TIMING_STEPS)

/** A report from the browser, or null. Unknown step names and bad numbers are dropped; marks come back in time order. */
export function parseTimingReport(raw: unknown): TimingReport | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { entry?: unknown; outcome?: unknown; marks?: unknown }
  if (!TIMING_ENTRIES.includes(r.entry as never) || !TIMING_OUTCOMES.includes(r.outcome as never)) return null
  const marks = (Array.isArray(r.marks) ? r.marks : [])
    .filter((m): m is [TimingStep, number] => Array.isArray(m) && STEP_SET.has(m[0]) && typeof m[1] === 'number' && Number.isFinite(m[1]) && m[1] >= 0 && m[1] <= TIMING_LIMITS.maxMs)
    .map(([s, ms]): [TimingStep, number] => [s, Math.round(ms)])
    .sort((a, b) => a[1] - b[1])
    .slice(0, TIMING_LIMITS.marks)
  return { entry: r.entry as TimingReport['entry'], outcome: r.outcome as TimingReport['outcome'], marks }
}

/** One log line: each step's time since page start, the gap from the step before, and tap -> first audio. */
export function formatTimingLine(r: TimingReport): string {
  const parts = r.marks.map(([s, ms], i) => (i === 0 ? `${s} ${ms}` : `${s} ${ms} (+${ms - r.marks[i - 1][1]})`))
  const at = (s: TimingStep) => r.marks.find(([x]) => x === s)?.[1]
  const tap = at('tap')
  const audio = at('first audio ready')
  const total = tap !== undefined && audio !== undefined ? ` | tap->audio ${audio - tap}` : ''
  return `[call-timing] ${r.entry} ${r.outcome} | ${parts.join(' | ')}${total}`
}

// ---------- browser side ----------

const pageMarks: [TimingStep, number][] = []

/** Records a step once per page (the first time it happens), as ms since the page started. */
export function markPage(step: TimingStep): void {
  if (typeof performance === 'undefined' || pageMarks.some(([s]) => s === step)) return
  pageMarks.push([step, performance.now()])
}

/** The page's boot marks plus one call's marks, ready to send. */
export function timingReport(entry: TimingReport['entry'], outcome: TimingReport['outcome'], callMarks: [TimingStep, number][]): TimingReport {
  return { entry, outcome, marks: [...pageMarks, ...callMarks] }
}

/** Fire-and-forget: never delays or breaks a call. */
export function sendTimingReport(report: TimingReport, idToken: Promise<string>): void {
  void idToken
    .then((token) =>
      fetch('/api/call-timing', {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(report),
      }),
    )
    .catch(() => undefined)
}
