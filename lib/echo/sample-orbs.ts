import type { Orb, OrbKind } from './orbs'

/** Fixed demo orbs for the landing page. Not user data. */
function sample(n: number, label: string, radius: number, counts: Partial<Record<OrbKind, number>>): Orb {
  const full: Record<OrbKind, number> = { note: 0, goal: 0, reminder: 0, health: 0, person: 0, interest: 0, ...counts }
  return {
    id: `orb-sample-${n}`,
    pageId: `sample-${n}`,
    label,
    ms: n,
    messageCount: 0,
    counts: full,
    members: [],
    involvement: 0,
    radius,
  }
}

export const SAMPLE_ORBS: Orb[] = [
  sample(1, 'A long day', 40, { note: 3, goal: 2, person: 2, health: 1 }),
  sample(2, 'Call with mum', 28, { person: 2, reminder: 1 }),
  sample(3, 'Morning run', 34, { goal: 2, health: 2, interest: 1 }),
  sample(4, 'Quiet evening', 22, { interest: 1 }),
  sample(5, 'Planning the week', 30, { reminder: 2, note: 1, goal: 1 }),
]

export const SAMPLE_THREADS: { source: string; target: string; kind: OrbKind }[] = [
  { source: 'orb-sample-1', target: 'orb-sample-2', kind: 'person' },
  { source: 'orb-sample-1', target: 'orb-sample-3', kind: 'goal' },
  { source: 'orb-sample-3', target: 'orb-sample-4', kind: 'interest' },
  { source: 'orb-sample-2', target: 'orb-sample-5', kind: 'reminder' },
]
