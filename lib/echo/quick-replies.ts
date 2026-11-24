/**
 * Tap answers under Echo's latest reply: when the reply ends with a yes/no question ("Want a reminder closer to
 * the date?"), offer "Yes please" / "No thanks". Open questions ("What did you eat?"), choices ("tea or coffee?")
 * and replies that don't end with a question get none.
 */
export const YES_NO_REPLIES = ['Yes please', 'No thanks'] as const

// A yes/no question opens with an auxiliary or a short "want" ("Want a reminder…?").
const YES_NO_START =
  /^(?:want|wanna|do|does|did|don't|should|shall|would|could|can|will|is|isn't|are|aren't|was|were|have|has|had|may|might|need|any|ready|sound|sounds|ok|okay|all set)\b/i

export function quickReplies(reply: string): string[] {
  const text = reply.trim().replace(/["'”’)\]]+$/u, '')
  if (!text.endsWith('?')) return []
  // The last sentence: what follows the last . ! ? or line break before the final "?".
  const body = text.slice(0, -1)
  const cut = Math.max(body.lastIndexOf('.'), body.lastIndexOf('!'), body.lastIndexOf('?'), body.lastIndexOf('\n'))
  const question = body
    .slice(cut + 1)
    .trim()
    .replace(/^[^\p{L}]+/u, '')
  if (!YES_NO_START.test(question)) return []
  if (/\bor\b/i.test(question)) return []
  return [...YES_NO_REPLIES]
}
