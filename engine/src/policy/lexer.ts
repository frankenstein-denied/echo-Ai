/*
 * Echo Legacy engine — Legacy Policy lexer (ticket 2.11).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Turns policy text into tokens for the recursive-descent parser. Statements are
 * line-based, so line breaks become NEWLINE tokens. Every token records its line and
 * column so later errors can point at the exact place. Grammar: grammar/policy.ebnf.
 */
import { PolicySyntaxError } from '../errors'
import { KEYWORDS, type Token, type TokenType } from './tokens'

const DATE_RE = /^\d{4}-\d{2}-\d{2}/
const NUMBER_RE = /^\d+/
const WORD_RE = /^[A-Za-z_][A-Za-z0-9_]*/
const OPERATORS = ['>=', '<=', '>', '<', '='] as const

export function tokenize(source: string): readonly Token[] {
  const text = source.replace(/\r\n?/g, '\n')
  const tokens: Token[] = []
  let pos = 0
  let line = 1
  let column = 1

  const push = (type: TokenType, value: string, atLine: number, atColumn: number) =>
    tokens.push(Object.freeze({ type, value, line: atLine, column: atColumn }))
  const advance = (n: number) => {
    pos += n
    column += n
  }

  while (pos < text.length) {
    const ch = text[pos]
    const rest = text.slice(pos)

    if (ch === ' ' || ch === '\t') {
      advance(1)
      continue
    }
    if (ch === '#') {
      while (pos < text.length && text[pos] !== '\n') advance(1)
      continue
    }
    if (ch === '\n') {
      const last = tokens[tokens.length - 1]
      if (last && last.type !== 'NEWLINE') push('NEWLINE', '\n', line, column)
      pos += 1
      line += 1
      column = 1
      continue
    }
    if (ch === '"') {
      const end = text.indexOf('"', pos + 1)
      const newline = text.indexOf('\n', pos + 1)
      if (end === -1 || (newline !== -1 && newline < end)) throw new PolicySyntaxError('Unterminated string', line, column)
      push('STRING', text.slice(pos + 1, end), line, column)
      advance(end - pos + 1)
      continue
    }
    if (ch === ':') {
      push('COLON', ':', line, column)
      advance(1)
      continue
    }
    const op = OPERATORS.find((o) => rest.startsWith(o))
    if (op) {
      push('OPERATOR', op, line, column)
      advance(op.length)
      continue
    }
    const date = DATE_RE.exec(rest)
    if (date) {
      push('DATE', date[0], line, column)
      advance(date[0].length)
      continue
    }
    const number = NUMBER_RE.exec(rest)
    if (number) {
      push('NUMBER', number[0], line, column)
      advance(number[0].length)
      continue
    }
    const word = WORD_RE.exec(rest)
    if (word) {
      const value = word[0].toLowerCase()
      push(KEYWORDS.has(value) ? 'KEYWORD' : 'NAME', value, line, column)
      advance(word[0].length)
      continue
    }
    throw new PolicySyntaxError(`Unknown character "${ch}"`, line, column)
  }

  push('EOF', '', line, column)
  return Object.freeze(tokens)
}
