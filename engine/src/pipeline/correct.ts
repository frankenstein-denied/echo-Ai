/*
 * Echo Legacy engine — pipeline step 3: correct (ticket 2.04). Pure function.
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * A small, predictable rule set (the "light fix" writing mode uses it). The same
 * input always gives the same output; no AI is involved.
 */

const MISSPELLINGS: Readonly<Record<string, string>> = {
  teh: 'the',
  recieve: 'receive',
  alot: 'a lot',
  definately: 'definitely',
  seperate: 'separate',
  untill: 'until',
  wich: 'which',
  becuase: 'because',
  tommorow: 'tomorrow',
  occured: 'occurred',
}

const WORD = "[\\p{L}\\p{M}']"
const MISSPELLING_RE = new RegExp(`(?<!${WORD})(${Object.keys(MISSPELLINGS).join('|')})(?!${WORD})`, 'giu')
const DOUBLED_RE = new RegExp(`(?<!${WORD})(${WORD}+)(?:\\s+\\1)+(?!${WORD})`, 'giu')
const LONE_I_RE = new RegExp(`(?<!${WORD})i(?!${WORD})`, 'gu')

const keepCase = (original: string, fixed: string) =>
  /^\p{Lu}/u.test(original) ? fixed.charAt(0).toUpperCase() + fixed.slice(1) : fixed

export function correct(text: string): string {
  if (!text.trim()) return ''
  let out = text.replace(MISSPELLING_RE, (m) => keepCase(m, MISSPELLINGS[m.toLowerCase()]))
  out = out.replace(DOUBLED_RE, '$1')
  out = out.replace(LONE_I_RE, 'I')
  out = out.replace(/(^\s*|[.!?]\s+)(\p{Ll})/gu, (_m, before: string, letter: string) => before + letter.toUpperCase())
  if (/[\p{L}\p{N}]$/u.test(out)) out += '.'
  return out
}
