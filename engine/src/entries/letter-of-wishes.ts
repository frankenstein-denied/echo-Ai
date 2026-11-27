/*
 * Echo Legacy engine — a Letter of Wishes: a sealed personal message to one person,
 * opened on a release date (ticket 2.03). It is not a legal will.
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */
import { Entry, isIsoDate, type EntryData, type EntryRecord } from './entry'

export type LetterData = EntryData & { title: string; recipient: string; releaseDate: string }

export class LetterOfWishes extends Entry {
  static readonly DISCLAIMER =
    'A Letter of Wishes is a personal message, not a legal will. It has no legal effect under Philippine law and is not legal advice.'

  readonly #title: string
  readonly #recipient: string
  readonly #releaseDate: string

  constructor(data: LetterData) {
    super(data)
    if (!data.title.trim()) throw new Error('A letter needs a title.')
    if (!data.recipient.trim()) throw new Error('A letter needs a recipient.')
    if (!isIsoDate(data.releaseDate)) throw new Error(`Not a valid release date: ${data.releaseDate}`)
    this.#title = data.title
    this.#recipient = data.recipient
    this.#releaseDate = data.releaseDate
    Object.freeze(this)
  }

  get kind(): string {
    return 'letter'
  }
  get title(): string {
    return this.#title
  }
  get recipient(): string {
    return this.#recipient
  }
  get releaseDate(): string {
    return this.#releaseDate
  }

  describe(): string {
    return `Letter of Wishes "${this.title}" to ${this.recipient}, release ${this.releaseDate}`
  }

  /** Never reveals the letter's words. */
  summarize(): string {
    return `A letter to ${this.recipient} (sealed until ${this.releaseDate}).`
  }

  isReadableOn(today: string, asker: string): boolean {
    return asker === this.recipient && today >= this.releaseDate
  }

  toRecord(): EntryRecord {
    return { ...super.toRecord(), title: this.title, recipient: this.recipient, releaseDate: this.releaseDate }
  }
}
