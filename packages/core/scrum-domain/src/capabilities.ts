import { ValidationError } from './errors.js'

/**
 * What the running edition is licensed to do. The string values are the ones
 * a remote service returns in its handshake, so they may be added to but never
 * renamed.
 */
export const CAPABILITY = {
  core: 'scrum.core',
  collaboration: 'collaboration',
  rbac: 'rbac',
  auditBasic: 'audit.basic',
  auditAdvanced: 'audit.advanced',
  sso: 'sso',
  scim: 'scim',
  selfHosted: 'selfHosted',
} as const

export type Capability = (typeof CAPABILITY)[keyof typeof CAPABILITY]

export const CAPABILITIES: readonly Capability[] = Object.values(CAPABILITY)

const CAPABILITY_VALUES: readonly string[] = CAPABILITIES

export function toCapability(value: string): Capability {
  if (!CAPABILITY_VALUES.includes(value)) {
    throw new ValidationError(`Capability must be one of ${CAPABILITY_VALUES.join(', ')}`, {
      value,
    })
  }
  return value as Capability
}

/**
 * Read side of the entitlement service. The domain declares the port and never
 * constructs one: which capabilities an edition grants is a composition
 * decision, and a constant listing Community's set would put the commercial
 * matrix below the composition boundary.
 *
 * A `ReadonlySet<Capability>` satisfies this structurally, so a test or a local
 * composition passes a plain set with no adapter in between, while a real
 * entitlement service that also exposes numeric limits satisfies it too. The
 * limit side is deliberately absent: no rule here consumes one, and inventing
 * the vocabulary for it would import an edition concern the domain does not need.
 */
export interface CapabilitySet {
  has(capability: Capability): boolean
}
