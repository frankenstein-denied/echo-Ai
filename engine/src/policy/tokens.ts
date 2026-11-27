/*
 * Echo Legacy engine — Legacy Policy language tokens (ticket 2.11).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */

export type TokenType = 'KEYWORD' | 'NAME' | 'STRING' | 'DATE' | 'NUMBER' | 'COLON' | 'OPERATOR' | 'NEWLINE' | 'EOF'

/** One token; `line` and `column` are 1-based and point at its first character. */
export type Token = Readonly<{ type: TokenType; value: string; line: number; column: number }>

export const KEYWORDS: ReadonlySet<string> = new Set([
  'protocol', 'may', 'not', 'see', 'read', 'existence', 'summary', 'of', 'entries', 'mentioning', 'tagged',
  'release', 'letter', 'to', 'when', 'date', 'transfer', 'custody', 'if', 'trustee', 'unavailable', 'for',
  'days', 'default', 'writing', 'mode', 'verbatim', 'light_fix', 'review',
])
