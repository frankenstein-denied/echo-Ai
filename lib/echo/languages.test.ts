import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_LANGUAGE, languageCode, languagePromptName, LANGUAGES } from './languages'

describe('LANGUAGES', () => {
  it('starts with English, the default', () => {
    expect(LANGUAGES[0].code).toBe('en')
    expect(DEFAULT_LANGUAGE).toBe('en')
  })
  it('has 17 unique codes in the agreed order', () => {
    const codes = LANGUAGES.map((l) => l.code)
    expect(codes).toEqual(['en', 'fil', 'taglish', 'ceb', 'ilo', 'hil', 'es', 'zh', 'hi', 'ar', 'pt', 'fr', 'ja', 'ko', 'id', 'vi', 'de'])
    expect(new Set(codes).size).toBe(17)
  })
})

describe('languageCode', () => {
  it('keeps a known code', () => {
    expect(languageCode('fil')).toBe('fil')
    expect(languageCode('taglish')).toBe('taglish')
  })
  it('falls back to English for anything else', () => {
    for (const v of ['xx', undefined, null, 3, '', 'EN', 'toString']) expect(languageCode(v)).toBe('en')
  })
})

describe('languagePromptName', () => {
  it('gives the English name the model reads', () => {
    expect(languagePromptName('taglish')).toContain('Taglish')
    expect(languagePromptName('fil')).toBe('Filipino (Tagalog)')
    expect(languagePromptName('en')).toBe('English')
  })
})

describe('firestore.rules', () => {
  it('allows exactly the language codes the app offers', () => {
    const rules = readFileSync(join(__dirname, '..', '..', 'firestore.rules'), 'utf8')
    const list = rules.match(/d\.language in \[([^\]]*)\]/)
    expect(list).not.toBeNull()
    const codes = [...list![1].matchAll(/'([^']*)'/g)].map((m) => m[1])
    expect(codes).toEqual(LANGUAGES.map((l) => l.code))
  })
})
