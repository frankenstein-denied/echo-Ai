/*
 * Echo Legacy engine — typed exceptions.
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Every failure the engine can raise has its own type, so callers can fall back
 * to the safe action (usually the neutral reply) without parsing messages.
 */

export class EchoLegacyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** The asker may not see what they asked for (or it does not exist; the two look the same). */
export class AccessDenied extends EchoLegacyError {}

/** A name matches more than one person. */
export class AmbiguousName extends EchoLegacyError {}

/** The policy cannot change any more: the death trigger has fired. */
export class PolicyFrozen extends EchoLegacyError {}

/** The policy text is not valid; points at the exact place. */
export class PolicySyntaxError extends EchoLegacyError {
  readonly line: number
  readonly column: number

  constructor(message: string, line: number, column: number) {
    super(`${message} (line ${line}, column ${column})`)
    this.line = line
    this.column = column
  }
}

/** The hash chain was altered; `index` is the first broken link. */
export class TamperDetected extends EchoLegacyError {
  readonly index: number

  constructor(message: string, index: number) {
    super(message)
    this.index = index
  }
}
