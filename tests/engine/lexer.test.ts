// Echo Legacy engine — Legacy Policy lexer (ticket 2.11).
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PolicySyntaxError } from '@/engine/src/errors'
import { tokenize } from '@/engine/src/policy/lexer'

const SAMPLES = path.resolve(__dirname, '../../grammar/samples')
const handout = readFileSync(path.join(SAMPLES, 'handout.policy'), 'utf8')

const pairs = (src: string) => tokenize(src).map((t) => [t.type, t.value])

function syntaxError(src: string): PolicySyntaxError {
  try {
    tokenize(src)
  } catch (e) {
    expect(e).toBeInstanceOf(PolicySyntaxError)
    return e as PolicySyntaxError
  }
  throw new Error('expected a PolicySyntaxError')
}

describe('policy lexer', () => {
  it("tokenizes the handout's sample policy", () => {
    const K = (v: string) => ['KEYWORD', v]
    const NL = ['NEWLINE', '\n']
    expect(pairs(handout)).toEqual([
      K('protocol'), ['NAME', 'maria'], ['COLON', ':'], NL,
      K('may'), K('see'), K('existence'), K('of'), K('entries'), K('mentioning'), ['NAME', 'maria'], NL,
      K('may'), K('read'), K('summary'), K('of'), K('entries'), K('tagged'), ['STRING', 'family'], NL,
      K('release'), K('letter'), ['STRING', 'To my daughter'], K('to'), ['NAME', 'maria'], K('when'), K('date'),
      ['OPERATOR', '>='], ['DATE', '2040-05-01'], NL,
      K('transfer'), K('custody'), K('to'), ['NAME', 'adam_jr'], K('if'), K('trustee'), K('unavailable'), K('for'),
      ['NUMBER', '90'], K('days'), NL,
      K('default'), K('writing'), K('mode'), ['COLON', ':'], K('light_fix'), NL,
      ['EOF', ''],
    ])
  })

  it('every token keeps its line and column', () => {
    const tokens = tokenize(handout)
    const at = (value: string, nth = 0) => tokens.filter((t) => t.value === value)[nth]
    expect(at('maria')).toMatchObject({ type: 'NAME', line: 1, column: 10 })
    expect(at('family')).toMatchObject({ type: 'STRING', line: 3, column: 39 })
    expect(at('2040-05-01')).toMatchObject({ type: 'DATE', line: 4, column: 55 })
    expect(at('90')).toMatchObject({ type: 'NUMBER', line: 5, column: 56 })
    expect(at('light_fix')).toMatchObject({ type: 'KEYWORD', line: 6, column: 23 })
  })

  it('every sample program tokenizes without error', () => {
    for (const file of readdirSync(SAMPLES).filter((f) => f.endsWith('.policy'))) {
      const tokens = tokenize(readFileSync(path.join(SAMPLES, file), 'utf8'))
      expect(tokens[tokens.length - 1].type).toBe('EOF')
    }
  })

  it('CRLF input gives the same tokens and line numbers', () => {
    const lf = tokenize(handout)
    const crlf = tokenize(handout.replace(/\n/g, '\r\n'))
    expect(crlf).toEqual(lf)
  })

  it('tabs count as one column', () => {
    expect(tokenize('\tdefault')[0]).toMatchObject({ value: 'default', line: 1, column: 2 })
  })

  it('an unknown character raises a clear error with its position', () => {
    const e = syntaxError('protocol maria:\n    @x')
    expect(e.line).toBe(2)
    expect(e.column).toBe(5)
    expect(e.message).toContain('Unknown character "@"')
  })

  it('an unterminated string raises an error at its opening quote', () => {
    const e = syntaxError('release letter "To my daughter')
    expect(e.message).toContain('Unterminated string')
    expect([e.line, e.column]).toEqual([1, 16])
    expect(syntaxError('release letter "To my\ndaughter"').line).toBe(1)
  })

  it('ignores comments and blank lines', () => {
    expect(pairs('# a note\n\n\ntrustee lito # who looks after it\n')).toEqual([
      ['KEYWORD', 'trustee'],
      ['NAME', 'lito'],
      ['NEWLINE', '\n'],
      ['EOF', ''],
    ])
  })

  it('reads keywords and names case-insensitively', () => {
    expect(pairs('PROTOCOL Maria:').slice(0, 2)).toEqual([
      ['KEYWORD', 'protocol'],
      ['NAME', 'maria'],
    ])
  })

  it('recognises every operator, and dates before numbers', () => {
    expect(pairs('>= <= > < = 2040-05-01 7').slice(0, 7)).toEqual([
      ['OPERATOR', '>='],
      ['OPERATOR', '<='],
      ['OPERATOR', '>'],
      ['OPERATOR', '<'],
      ['OPERATOR', '='],
      ['DATE', '2040-05-01'],
      ['NUMBER', '7'],
    ])
  })

  it('returns frozen tokens', () => {
    const tokens = tokenize('trustee lito')
    expect(Object.isFrozen(tokens)).toBe(true)
    expect(Object.isFrozen(tokens[0])).toBe(true)
  })
})
