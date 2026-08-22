import type { Revision, Sprint, WorkItem } from '@dsh-scrum/scrum-domain'

/** One entity in a batch, with the revision the caller read it at. */
export interface WorkItemWrite {
  readonly item: WorkItem
  readonly expected: Revision
}

export interface SprintWrite {
  readonly sprint: Sprint
  readonly expected: Revision
}

/**
 * A set of writes that has to land together.
 *
 * Grouped by entity type rather than as one heterogeneous list, so a store can
 * dispatch each group without inspecting values, and so an empty group is
 * simply an absent field.
 */
export interface AtomicWrites {
  readonly workItems?: readonly WorkItemWrite[] | undefined
  readonly sprints?: readonly SprintWrite[] | undefined
}

/**
 * Applies several entities as one decision.
 *
 * Every revision is checked before anything is written, and a failure leaves
 * nothing behind. Closing a sprint changes the sprint and the items that did
 * not land in it, and a batch that stopped halfway would leave a closed sprint
 * still holding unfinished work — or unfinished work pointing at a sprint that
 * never closed.
 *
 * The operation name travels with the writes so a store that journals its
 * multi-entity operations can say what was being attempted when it recovers
 * one.
 */
export interface TransactionPort {
  apply(operation: string, writes: AtomicWrites): Promise<void>
}
