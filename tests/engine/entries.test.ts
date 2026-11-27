// Echo Legacy engine — entry types (ticket 2.03).
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { describe, expect, it } from 'vitest'
import { DiaryEntry, Entry, LetterOfWishes, entryFromRecord } from '@/engine/src/entries'

const diary = new DiaryEntry({
  id: 'e1',
  date: '2024-06-12',
  text: 'Took Maria to the beach in Daet and we ate grilled fish by the water.',
  tags: ['Family', ' family ', 'Travel'],
})

const letter = new LetterOfWishes({
  id: 'e20',
  date: '2026-10-30',
  text: 'Anak, if you are reading this, know that I was always proud of you.',
  tags: ['family'],
  title: 'To my daughter',
  recipient: 'maria',
  releaseDate: '2040-05-01',
})

describe('Entry types', () => {
  it('diary entries store date, text and cleaned tags', () => {
    expect(diary.date).toBe('2024-06-12')
    expect(diary.text).toContain('beach in Daet')
    expect(diary.tags).toEqual(['family', 'travel'])
    expect(diary.kind).toBe('diary')
  })

  it('letters store a recipient and a release date', () => {
    expect(letter.kind).toBe('letter')
    expect(letter.title).toBe('To my daughter')
    expect(letter.recipient).toBe('maria')
    expect(letter.releaseDate).toBe('2040-05-01')
  })

  it('describe and summarize work on any entry type without checking its type', () => {
    const entries: Entry[] = [diary, letter]
    expect(entries.map((e) => e.describe())).toEqual([
      'Diary entry, 2024-06-12: Took Maria to the beach in Daet and…',
      'Letter of Wishes "To my daughter" to maria, release 2040-05-01',
    ])
    expect(entries.map((e) => e.summarize())).toEqual([
      'Took Maria to the beach in Daet and we ate grilled fish by the water.',
      'A letter to maria (sealed until 2040-05-01).',
    ])
  })

  it('a letter summary never reveals its text', () => {
    const summary = letter.summarize().toLowerCase()
    for (const word of ['anak', 'proud', 'reading']) expect(summary).not.toContain(word)
  })

  it('a letter is readable only by its recipient on or after the release date', () => {
    expect(letter.isReadableOn('2040-04-30', 'maria')).toBe(false)
    expect(letter.isReadableOn('2040-05-01', 'maria')).toBe(true)
    expect(letter.isReadableOn('2041-01-01', 'adam_jr')).toBe(false)
    expect(diary.isReadableOn('2000-01-01', 'anyone')).toBe(true)
  })

  it('summarize cuts long text at the word limit', () => {
    const e = new DiaryEntry({ id: 'x', date: '2024-01-01', text: 'one two three four', tags: [] })
    expect(e.summarize(3)).toBe('one two three…')
    expect(e.summarize(4)).toBe('one two three four')
  })

  it('rejects impossible dates and empty ids', () => {
    expect(() => new DiaryEntry({ id: 'x', date: '2026-02-30', text: 't', tags: [] })).toThrow()
    expect(() => new DiaryEntry({ id: 'x', date: '2026/02/01', text: 't', tags: [] })).toThrow()
    expect(() => new DiaryEntry({ id: ' ', date: '2026-02-01', text: 't', tags: [] })).toThrow()
    expect(() => new LetterOfWishes({ ...letter.toRecord(), releaseDate: '2040-13-01', title: 't', recipient: 'maria' })).toThrow()
  })

  it('round-trips both kinds through a plain record', () => {
    for (const e of [diary, letter]) {
      const back = entryFromRecord(e.toRecord())
      expect(back.constructor).toBe(e.constructor)
      expect(back.toRecord()).toEqual(e.toRecord())
    }
  })

  it('entries cannot be changed after creation', () => {
    expect(Object.isFrozen(diary.tags)).toBe(true)
    expect(() => {
      ;(diary as unknown as { text: string }).text = 'changed'
    }).toThrow()
  })

  it('the letter carries the not-a-legal-will disclaimer', () => {
    expect(LetterOfWishes.DISCLAIMER).toBe(
      'A Letter of Wishes is a personal message, not a legal will. It has no legal effect under Philippine law and is not legal advice.',
    )
  })
})
