/*
 * Echo Legacy engine — calls the Prolog access rules from TypeScript (ticket 1.04).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Uses tau-prolog, a Prolog interpreter written in JavaScript, so the rules run
 * in-process on every machine after `pnpm install`; no separate Prolog install.
 */
import pl from 'tau-prolog'
import loadLists from 'tau-prolog/modules/lists.js'
import loadPromises from 'tau-prolog/modules/promises.js'

loadLists(pl)
loadPromises(pl)

/** tau-prolog reports errors as Prolog terms; turn them into readable Errors. */
function toError(err: unknown): Error {
  if (err instanceof Error) return err
  const text = err && typeof err === 'object' && 'toString' in err ? String(err) : 'Prolog error'
  return new Error(`Prolog: ${text}`)
}

export class PrologSession {
  readonly #session: any

  private constructor(session: any) {
    this.#session = session
  }

  /** A new session with `programText` (Prolog clauses) loaded. */
  static async load(programText: string): Promise<PrologSession> {
    const session = pl.create(100000)
    try {
      await session.promiseConsult(programText)
    } catch (e) {
      throw toError(e)
    }
    return new PrologSession(session)
  }

  /** Adds one fact, e.g. `grant(maria, summary, tag(family))`. */
  async assert(fact: string): Promise<void> {
    const ok = await this.ask(`assertz((${fact}))`)
    if (!ok) throw new Error(`Prolog: could not assert ${fact}`)
  }

  /** True when `goal` can be proven. */
  async ask(goal: string): Promise<boolean> {
    try {
      await this.#session.promiseQuery(`${goal}.`)
      const answer = await this.#session.promiseAnswer()
      if (answer && pl.type.is_error(answer)) throw answer
      return Boolean(answer)
    } catch (e) {
      throw toError(e)
    }
  }

  /** Every binding of `variable` that makes `goal` true, in order, without duplicates. */
  async all(goal: string, variable: string): Promise<string[]> {
    const out: string[] = []
    try {
      await this.#session.promiseQuery(`${goal}.`)
      for await (const answer of this.#session.promiseAnswers()) {
        if (pl.type.is_error(answer)) throw answer
        const value = String(answer.links[variable])
        if (!out.includes(value)) out.push(value)
      }
    } catch (e) {
      throw toError(e)
    }
    return out
  }
}
