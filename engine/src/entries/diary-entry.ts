/*
 * Echo Legacy engine — an ordinary diary entry (ticket 2.03).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */
import { Entry, type EntryData } from './entry'

export class DiaryEntry extends Entry {
  constructor(data: EntryData) {
    super(data)
    Object.freeze(this)
  }

  get kind(): string {
    return 'diary'
  }

  describe(): string {
    return `Diary entry, ${this.date}: ${this.summarize(8)}`
  }
}
