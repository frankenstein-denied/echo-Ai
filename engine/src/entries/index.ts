/*
 * Echo Legacy engine — entry types.
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */
import { DiaryEntry } from './diary-entry'
import { Entry, type EntryRecord } from './entry'
import { LetterOfWishes } from './letter-of-wishes'
import { UnknownEntryType } from '../errors'

export { DiaryEntry, Entry, LetterOfWishes }
export { isIsoDate, type EntryData, type EntryRecord } from './entry'
export type { LetterData } from './letter-of-wishes'

/** Rebuilds an entry of the right type from its plain record. */
export function entryFromRecord(r: EntryRecord): Entry {
  const base = { id: r.id, date: r.date, text: r.text, tags: r.tags }
  if (r.kind === 'letter') {
    return new LetterOfWishes({ ...base, title: r.title ?? '', recipient: r.recipient ?? '', releaseDate: r.releaseDate ?? '' })
  }
  if (r.kind === 'diary') return new DiaryEntry(base)
  throw new UnknownEntryType(`Unknown entry kind: ${r.kind}`)
}
