/*
 * Echo Legacy engine — pipeline step 1: normalize (ticket 2.04). Pure function.
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */

/** Same text, tidied: NFC, \n line endings, straight quotes, single spaces, at most one blank line. */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
