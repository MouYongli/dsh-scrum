import { ValidationError } from './errors.js'

/**
 * What kind of work an item is, independent of where it sits in the hierarchy.
 *
 * A closed vocabulary rather than a label, because of the question it exists to
 * answer: how much of this sprint went into technical debt, or into keeping the
 * lights on. That answer is only comparable if the values are fixed and mean
 * the same thing in every project, which free text never manages.
 *
 * Persisted, so the values may be added to but never renamed.
 *
 * This module fixes the vocabulary and nothing else. Which type each category
 * suggests is a work item rule and lands with that aggregate, the same way the
 * status vocabulary and the transitions between statuses are kept apart.
 */
export const WORK_ITEM_CATEGORY = {
  /** New behaviour a user can see and ask for. */
  feature: 'feature',
  /** A quality the user experiences: speed, reliability, accessibility. */
  nfrVisible: 'nfr_visible',
  /** A constraint nobody outside the team observes directly. */
  nfrConstraint: 'nfr_constraint',
  /** Repaying a shortcut, or restructuring without changing behaviour. */
  techDebt: 'tech_debt',
  /** A time-boxed investigation that delivers a decision, not a feature. */
  spike: 'spike',
  /** Operations, infrastructure and migrations. */
  ops: 'ops',
  /** Documentation. */
  docs: 'docs',
  /** A defect in something already delivered. */
  defect: 'defect',
} as const

export type WorkItemCategory = (typeof WORK_ITEM_CATEGORY)[keyof typeof WORK_ITEM_CATEGORY]

const CATEGORIES: readonly string[] = Object.values(WORK_ITEM_CATEGORY)

export function toWorkItemCategory(value: string): WorkItemCategory {
  if (!CATEGORIES.includes(value)) {
    throw new ValidationError(`WorkItemCategory must be one of ${CATEGORIES.join(', ')}`, { value })
  }
  return value as WorkItemCategory
}
