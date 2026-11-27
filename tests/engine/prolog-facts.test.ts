// Echo Legacy engine — turning entries and protocols into Prolog facts (ticket 2.06).
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { describe, expect, it } from 'vitest'
import { DiaryEntry, LetterOfWishes } from '@/engine/src/entries'
import { Grant } from '@/engine/src/model'
import { entryFacts, personFacts, quoteAtom } from '@/engine/src/prolog/facts'

describe('Prolog facts', () => {
  it('quotes every atom safely', () => {
    expect(quoteAtom('maria')).toBe("'maria'")
    expect(quoteAtom("Maria's")).toBe("'Maria\\'s'")
    expect(quoteAtom('a\\b')).toBe("'a\\\\b'")
  })

  it('describes a diary entry: date, kind, tags and the people it mentions', () => {
    const e = new DiaryEntry({ id: 'e8', date: '2021-09-12', text: 'Took Maria and Adam Jr. to the beach.', tags: ['family', 'travel'] })
    expect(entryFacts([e], ['maria', 'adam_jr', 'lito'])).toEqual([
      "entry('e8', date(2021, 9, 12), 'diary')",
      "tag('e8', 'family')",
      "tag('e8', 'travel')",
      "mentions('e8', 'maria')",
      "mentions('e8', 'adam_jr')",
    ])
  })

  it('describes a letter with its title, recipient and release date', () => {
    const l = new LetterOfWishes({ id: 'e20', date: '2026-10-30', text: 'Anak…', tags: ['family'], title: 'To my daughter', recipient: 'maria', releaseDate: '2040-05-01' })
    expect(entryFacts([l], [])).toEqual([
      "entry('e20', date(2026, 10, 30), 'letter')",
      "tag('e20', 'family')",
      "letter('e20', 'To my daughter', 'maria', date(2040, 5, 1))",
    ])
  })

  it('describes a person, their protocol and its grants and denials', () => {
    const grants = [
      new Grant('existence', { kind: 'mentions', name: 'maria' }),
      new Grant('summary', { kind: 'tag', tag: 'Family' }),
      new Grant('full', { kind: 'letter', title: 'To my daughter' }),
      new Grant('summary', { kind: 'tag', tag: 'health' }, 'deny'),
    ]
    expect(personFacts('maria', grants)).toEqual([
      "person('maria')",
      "protocol('maria')",
      "grant('maria', existence, mentions('maria'))",
      "grant('maria', summary, tag('family'))",
      "grant('maria', full, letter('To my daughter'))",
      "deny('maria', summary, tag('health'))",
    ])
  })

  it('a registered person with no protocol is only a person fact', () => {
    expect(personFacts('stranger', null)).toEqual(["person('stranger')"])
  })
})
