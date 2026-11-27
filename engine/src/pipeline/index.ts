/*
 * Echo Legacy engine — the entry pipeline: normalize → correct → extract, plus a diff (ticket 2.04).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Functional: each step is a pure function; this file only composes them.
 */
import { correct } from './correct'
import { diff, type DiffPart } from './diff'
import { extractNamesAndTopics, type Extracted } from './extract'
import { normalize } from './normalize'

export { correct, diff, extractNamesAndTopics, normalize }
export { renderDiff, type DiffPart } from './diff'
export type { Extracted } from './extract'

export type Processed = Readonly<{
  original: string
  normalized: string
  corrected: string
  extracted: Extracted
  changes: readonly DiffPart[]
}>

export function processEntryText(text: string, tags: readonly string[] = [], knownPeople: readonly string[] = []): Processed {
  const normalized = normalize(text)
  const corrected = correct(normalized)
  return Object.freeze({
    original: text,
    normalized,
    corrected,
    extracted: extractNamesAndTopics(corrected, tags, knownPeople),
    changes: diff(normalized, corrected),
  })
}
