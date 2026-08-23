import { isWorkItemBlocked, isWorkItemPlannable, type WorkItem } from '@dsh-scrum/scrum-domain'
import type { MessageKey } from './messages.js'

/**
 * What the tool can actually check before a sprint takes an item on.
 *
 * A project's own Definition of Ready is a list of sentences a team wrote for
 * itself — "the API contract is agreed", "the designer signed it off" — and
 * nothing here can evaluate one. Counting them would mean either asking the
 * user to tick them per item, which is what acceptance criteria already are,
 * or claiming to have verified something nobody verified.
 *
 * So these are the structural conditions, checked honestly, and the project's
 * own list is shown beside the backlog as the reminder it is.
 */
export const READINESS_CHECK = {
  described: 'described',
  estimated: 'estimated',
  accepted: 'accepted',
  unblocked: 'unblocked',
} as const

export type ReadinessCheck = (typeof READINESS_CHECK)[keyof typeof READINESS_CHECK]

export const READINESS_CHECKS: readonly ReadinessCheck[] = [
  READINESS_CHECK.described,
  READINESS_CHECK.estimated,
  READINESS_CHECK.accepted,
  READINESS_CHECK.unblocked,
]

/** A total record, so a check added without copy does not compile. */
export const READINESS_LABEL: Readonly<Record<ReadinessCheck, MessageKey>> = {
  described: 'readiness.described',
  estimated: 'readiness.estimated',
  accepted: 'readiness.accepted',
  unblocked: 'readiness.unblocked',
}

export interface Readiness {
  readonly satisfied: readonly ReadinessCheck[]
  readonly missing: readonly ReadinessCheck[]
  readonly ready: boolean
}

function passes(item: WorkItem, check: ReadinessCheck): boolean {
  switch (check) {
    case READINESS_CHECK.described:
      return item.description.trim() !== ''
    case READINESS_CHECK.estimated:
      return item.estimate !== null
    case READINESS_CHECK.accepted:
      return item.acceptanceCriteria.length > 0
    case READINESS_CHECK.unblocked:
      return !isWorkItemBlocked(item)
  }
}

/**
 * Whether an item is worth taking into a sprint, or null when the question
 * does not apply.
 *
 * Only the level a sprint can take is asked. An epic is never planned and a
 * subtask rides on its parent, so a readiness badge on either would be asking
 * a question nobody has to answer.
 */
export function readinessOf(item: WorkItem): Readiness | null {
  if (!isWorkItemPlannable(item)) {
    return null
  }
  const satisfied = READINESS_CHECKS.filter((check) => passes(item, check))
  const missing = READINESS_CHECKS.filter((check) => !passes(item, check))
  return { satisfied, missing, ready: missing.length === 0 }
}
