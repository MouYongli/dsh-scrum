import { ValidationError } from './errors.js'

/**
 * Which product the data was produced by. The string values are persisted in
 * `project.json` and travel through export and migration packages, so they may
 * be added to but never renamed.
 *
 * This is a label, not a switch. No domain rule may branch on it: behaviour
 * differences are decided by `Capability`, which a remote service returns in
 * its handshake and a local composition supplies directly. Branching here
 * would put the commercial matrix below the composition boundary and let a
 * Community build behave differently from a Teams build running the same rules.
 */
export const EDITION = {
  community: 'community',
  teams: 'teams',
  enterprise: 'enterprise',
} as const

export type Edition = (typeof EDITION)[keyof typeof EDITION]

const EDITIONS: readonly string[] = Object.values(EDITION)

export function toEdition(value: string): Edition {
  if (!EDITIONS.includes(value)) {
    throw new ValidationError('Edition must be community, teams or enterprise', { value })
  }
  return value as Edition
}
