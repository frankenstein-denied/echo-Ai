/*
 * Echo Legacy engine — Owner: the person whose diary this is (ticket 2.02).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */
import { AccessDenied, AmbiguousName, PolicyFrozen } from '../errors'
import type { Beneficiary } from './beneficiary'
import type { Protocol } from './protocol'
import { Vault } from './vault'

export class Owner {
  readonly #name: string
  readonly #vault: Vault
  readonly #beneficiaries: Beneficiary[] = []
  #policyFrozen = false

  constructor(name: string, vault: Vault = new Vault()) {
    this.#name = name
    this.#vault = vault
  }

  get name(): string {
    return this.#name
  }
  get vault(): Vault {
    return this.#vault
  }
  get isPolicyFrozen(): boolean {
    return this.#policyFrozen
  }
  get beneficiaries(): readonly Beneficiary[] {
    return Object.freeze([...this.#beneficiaries])
  }

  addBeneficiary(beneficiary: Beneficiary): void {
    this.#assertEditable()
    this.#beneficiaries.push(beneficiary)
  }

  assignProtocol(beneficiary: Beneficiary, protocol: Protocol): void {
    this.#assertEditable()
    beneficiary.assignProtocol(protocol)
  }

  /** Called when the death trigger fires: from now on the policy cannot change. */
  freezePolicy(): void {
    this.#policyFrozen = true
  }

  findBeneficiary(nameOrId: string): Beneficiary {
    const wanted = nameOrId.trim().toLowerCase()
    const matches = this.#beneficiaries.filter(
      (b) => b.id.toLowerCase() === wanted || b.displayName.toLowerCase() === wanted,
    )
    if (matches.length === 0) throw new AccessDenied('Nothing to share.')
    if (matches.length > 1) throw new AmbiguousName(`More than one person is called "${nameOrId}".`)
    return matches[0]
  }

  #assertEditable(): void {
    if (this.#policyFrozen) throw new PolicyFrozen('The legacy policy is frozen and cannot change.')
  }
}
