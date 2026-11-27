/*
 * Echo Legacy engine — pipeline step 2: extract names and topics (ticket 2.04). Pure function.
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */

export type Extracted = Readonly<{ names: readonly string[]; topics: readonly string[] }>

const STOP_WORDS: ReadonlySet<string> = new Set([
  'I', 'The', 'A', 'An', 'My', 'Our', 'We', 'He', 'She', 'They', 'It', 'Today',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
])

/** Lower-case surname particles that can sit between capitalised name words ("Juan dela Cruz"). */
const PARTICLES: ReadonlySet<string> = new Set(['de', 'dela', 'del', 'delos', 'san', 'santa'])

const TOPIC_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  family: ['family', 'daughter', 'son', 'wife', 'husband', 'mother', 'father', 'apo', 'kids'],
  business: ['business', 'store', 'sales', 'supplier', 'profit', 'customers', 'shop'],
  health: ['doctor', 'hospital', 'medicine', 'check-up', 'sick'],
  travel: ['trip', 'travel', 'flight', 'beach', 'visit'],
  faith: ['church', 'mass', 'pray'],
}

const TOKEN_RE = /[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*|[.!?]/gu

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function knownPeopleIn(text: string, knownPeople: readonly string[]): string[] {
  return knownPeople.filter((person) => {
    const name = person.trim()
    if (!name) return false
    return new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(name)}(?![\\p{L}\\p{M}])`, 'iu').test(text)
  })
}

/** Runs of capitalised words that do not start a sentence and are not stop words. */
function capitalisedNames(text: string): string[] {
  const names: string[] = []
  let current: string[] = []
  let pending: string[] = []
  let atSentenceStart = true
  const flush = () => {
    if (current.length) names.push(current.join(' '))
    current = []
    pending = []
  }
  for (const token of text.match(TOKEN_RE) ?? []) {
    if (/^[.!?]$/.test(token)) {
      flush()
      atSentenceStart = true
      continue
    }
    const capitalised = /^\p{Lu}/u.test(token)
    if (capitalised && !atSentenceStart && !STOP_WORDS.has(token)) {
      current.push(...pending, token)
      pending = []
    } else if (current.length && PARTICLES.has(token)) {
      pending.push(token)
    } else {
      flush()
    }
    atSentenceStart = false
  }
  flush()
  return names
}

function topicsIn(text: string, tags: readonly string[]): string[] {
  const words = new Set((text.toLowerCase().match(TOKEN_RE) ?? []).filter((t) => !/^[.!?]$/.test(t)))
  const topics = new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((k) => words.has(k))) topics.add(topic)
  }
  return [...topics]
}

export function extractNamesAndTopics(
  text: string,
  tags: readonly string[] = [],
  knownPeople: readonly string[] = [],
): Extracted {
  const known = knownPeopleIn(text, knownPeople)
  const knownLower = new Set(known.map((k) => k.toLowerCase()))
  const names = new Set(known)
  for (const n of capitalisedNames(text)) if (!knownLower.has(n.toLowerCase())) names.add(n)
  return Object.freeze({
    names: Object.freeze([...names].sort()),
    topics: Object.freeze(topicsIn(text, tags).sort()),
  })
}
