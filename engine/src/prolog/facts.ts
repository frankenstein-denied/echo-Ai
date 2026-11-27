/*
 * Echo Legacy engine — turns entries and protocols into Prolog facts (ticket 2.06).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Fact structure (see prolog/access_rules.pl):
 *   person(P).                         a registered person
 *   protocol(P).                       P has a protocol
 *   entry(E, date(Y, M, D), Kind).     an entry; Kind is 'diary' or 'letter'
 *   tag(E, T).                         entry E has tag T
 *   mentions(E, P).                    entry E mentions person P
 *   letter(E, Title, Recipient, date(Y, M, D)).   a Letter of Wishes and its release date
 *   grant(P, Level, Selector).         Level: existence | summary | full
 *   deny(P, Level, Selector).          Selector: tag(T) | mentions(P) | letter(Title)
 * Every name is a quoted atom, so any text is safe inside a fact.
 */
import { LetterOfWishes, type Entry } from '../entries'
import { mentionsName, type Grant, type Selector } from '../model/grant'

/** A Prolog quoted atom: 'text', with \ and ' escaped. */
export function quoteAtom(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

const dateTerm = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `date(${y}, ${m}, ${d})`
}

function selectorTerm(s: Readonly<Selector>): string {
  switch (s.kind) {
    case 'tag':
      return `tag(${quoteAtom(s.tag.trim().toLowerCase())})`
    case 'mentions':
      return `mentions(${quoteAtom(s.name)})`
    case 'letter':
      return `letter(${quoteAtom(s.title)})`
  }
}

/** Facts for entries. `people` are person ids; an entry mentions a person when it names them as a whole word. */
export function entryFacts(entries: readonly Entry[], people: readonly string[]): string[] {
  const facts: string[] = []
  for (const e of entries) {
    const id = quoteAtom(e.id)
    facts.push(`entry(${id}, ${dateTerm(e.date)}, ${quoteAtom(e.kind)})`)
    for (const t of e.tags) facts.push(`tag(${id}, ${quoteAtom(t)})`)
    for (const p of people) if (mentionsName(e.text, p)) facts.push(`mentions(${id}, ${quoteAtom(p)})`)
    if (e instanceof LetterOfWishes) {
      facts.push(`letter(${id}, ${quoteAtom(e.title)}, ${quoteAtom(e.recipient)}, ${dateTerm(e.releaseDate)})`)
    }
  }
  return facts
}

/** Facts for one registered person: their protocol (if any) and its grants and denials. */
export function personFacts(personId: string, grants: readonly Grant[] | null): string[] {
  const p = quoteAtom(personId)
  const facts = [`person(${p})`]
  if (grants === null) return facts
  facts.push(`protocol(${p})`)
  for (const g of grants) facts.push(`${g.effect === 'deny' ? 'deny' : 'grant'}(${p}, ${g.level}, ${selectorTerm(g.selector)})`)
  return facts
}
