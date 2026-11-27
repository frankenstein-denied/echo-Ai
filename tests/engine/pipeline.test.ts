// Echo Legacy engine — pure entry pipeline (tickets 2.04, 2.10).
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { describe, expect, it } from 'vitest'
import { correct, diff, extractNamesAndTopics, normalize, processEntryText, renderDiff } from '@/engine/src/pipeline'

describe('normalize', () => {
  it('collapses spaces, line endings, blank lines and curly quotes', () => {
    expect(normalize('  Hello   world \r\n\r\n\r\n “hi”  ')).toBe('Hello world\n\n"hi"')
    expect(normalize('It’s\tfine')).toBe("It's fine")
  })

  it('returns empty text for empty or blank input', () => {
    expect(normalize('')).toBe('')
    expect(normalize(' \n\t ')).toBe('')
  })

  it('composes accents into single characters (NFC)', () => {
    expect(normalize('Niño')).toBe('Niño')
  })
})

describe('extractNamesAndTopics', () => {
  it('extracts names with diacritics and multi-word surnames', () => {
    const r = extractNamesAndTopics('Met Niño and Juan Dela Cruz at church. Niño laughed.')
    expect(r.names).toEqual(['Juan Dela Cruz', 'Niño'])
    expect(r.topics).toContain('faith')
  })

  it('lists repeated names once', () => {
    expect(extractNamesAndTopics('I called Maria. Then Maria called Maria back.').names).toEqual(['Maria'])
  })

  it('does not take sentence-start words as names', () => {
    expect(extractNamesAndTopics('Today Maria came. Business was slow.').names).toEqual(['Maria'])
  })

  it('finds known people case-insensitively, in their known spelling', () => {
    expect(extractNamesAndTopics('lunch with adam jr. and lito', [], ['Adam Jr.', 'Lito']).names).toEqual(['Adam Jr.', 'Lito'])
  })

  it('takes topics from tags and keywords, unique and sorted', () => {
    const r = extractNamesAndTopics('The store had good sales. My daughter helped.', ['Travel', 'business'])
    expect(r.topics).toEqual(['business', 'family', 'travel'])
  })

  it('handles empty text', () => {
    expect(extractNamesAndTopics('')).toEqual({ names: [], topics: [] })
  })
})

describe('correct', () => {
  it('fixes doubled words, common misspellings, "i" and sentence starts', () => {
    expect(correct('i went to teh the store')).toBe('I went to the store.')
    expect(correct('we recieve alot. it was definately good')).toBe('We receive a lot. It was definitely good.')
  })

  it('keeps an existing end mark', () => {
    expect(correct('Is it done?')).toBe('Is it done?')
  })

  it('returns empty text for empty input', () => {
    expect(correct('')).toBe('')
  })
})

describe('diff', () => {
  it('shows what changed from the original', () => {
    const parts = diff('i went to teh store', 'I went to the store.')
    expect(parts).toEqual([
      { op: 'del', text: 'i' },
      { op: 'add', text: 'I' },
      { op: 'same', text: 'went to' },
      { op: 'del', text: 'teh store' },
      { op: 'add', text: 'the store.' },
    ])
    expect(renderDiff(parts)).toBe('[-i-] {+I+} went to [-teh store-] {+the store.+}')
  })

  it('identical text is a single unchanged part', () => {
    expect(diff('same words here', 'same words here')).toEqual([{ op: 'same', text: 'same words here' }])
  })

  it('handles empty text on either side', () => {
    expect(diff('', 'a b')).toEqual([{ op: 'add', text: 'a b' }])
    expect(diff('a b', '')).toEqual([{ op: 'del', text: 'a b' }])
    expect(diff('', '')).toEqual([])
  })
})

describe('purity', () => {
  it('does not change its inputs and freezes its outputs', () => {
    const tags = Object.freeze(['family'])
    const people = Object.freeze(['Maria'])
    const out = extractNamesAndTopics('Maria visited.', tags, people)
    expect(Object.isFrozen(out)).toBe(true)
    expect(Object.isFrozen(out.names)).toBe(true)
    expect(Object.isFrozen(diff('a', 'b'))).toBe(true)
    expect(tags).toEqual(['family'])
  })

  it('the same input always gives the same output', () => {
    const text = 'i met Maria at teh store. business was good'
    expect(processEntryText(text, ['family'], ['Maria'])).toEqual(processEntryText(text, ['family'], ['Maria']))
    expect(correct(text)).toBe(correct(text))
  })

  it('processEntryText keeps the original and chains the steps', () => {
    const r = processEntryText('  i saw Maria at teh   store  ', [], ['Maria'])
    expect(r.original).toBe('  i saw Maria at teh   store  ')
    expect(r.normalized).toBe('i saw Maria at teh store')
    expect(r.corrected).toBe('I saw Maria at the store.')
    expect(r.extracted.names).toEqual(['Maria'])
    expect(r.extracted.topics).toEqual(['business'])
    expect(renderDiff(r.changes)).toBe('[-i-] {+I+} saw Maria at [-teh store-] {+the store.+}')
    expect(Object.isFrozen(r)).toBe(true)
  })
})
