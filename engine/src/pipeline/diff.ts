/*
 * Echo Legacy engine — pipeline step 4: diff (ticket 2.04). Pure functions.
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Word-level longest-common-subsequence diff between the original and the corrected text.
 */

export type DiffPart = Readonly<{ op: 'same' | 'del' | 'add'; text: string }>

const words = (s: string) => s.split(/\s+/).filter(Boolean)

export function diff(original: string, corrected: string): readonly DiffPart[] {
  const a = words(original)
  const b = words(corrected)
  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const parts: DiffPart[] = []
  let dels: string[] = []
  let adds: string[] = []
  const flushChanges = () => {
    if (dels.length) parts.push({ op: 'del', text: dels.join(' ') })
    if (adds.length) parts.push({ op: 'add', text: adds.join(' ') })
    dels = []
    adds = []
  }
  const pushSame = (w: string) => {
    flushChanges()
    const last = parts[parts.length - 1]
    if (last?.op === 'same') parts[parts.length - 1] = { op: 'same', text: `${last.text} ${w}` }
    else parts.push({ op: 'same', text: w })
  }

  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      pushSame(a[i])
      i++
      j++
    } else if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) {
      dels.push(a[i++])
    } else {
      adds.push(b[j++])
    }
  }
  flushChanges()
  return Object.freeze(parts.map((p) => Object.freeze(p)))
}

/** Text form: unchanged words as-is, removed as [-…-], added as {+…+}. */
export function renderDiff(parts: readonly DiffPart[]): string {
  return parts
    .map((p) => (p.op === 'same' ? p.text : p.op === 'del' ? `[-${p.text}-]` : `{+${p.text}+}`))
    .join(' ')
}
