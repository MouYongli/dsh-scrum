import { ValidationError } from '@dsh-scrum/scrum-domain'

/** How many items a listing returns when the caller does not say. */
export const DEFAULT_LIMIT = 20

/**
 * The most any one call returns, whatever the caller asks for.
 *
 * A tool result is text in a conversation with a finite window. A backlog of
 * two thousand items returned whole does not inform the model, it evicts
 * everything the user said before it — so the bound is the tool's, not the
 * caller's, and asking for more is refused rather than quietly honoured.
 */
export const MAX_LIMIT = 100

export function requireLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ValidationError(`limit must be a whole number between 1 and ${MAX_LIMIT}`, {
      limit,
      maxLimit: MAX_LIMIT,
    })
  }
  return limit
}

/** A bounded slice, which always says how much it left behind. */
export interface Page<Item> {
  readonly items: readonly Item[]
  readonly total: number
  readonly truncated: boolean
}

/**
 * Cuts a listing down to size and says so.
 *
 * `total` and `truncated` travel with it because a model handed twenty of two
 * hundred items with no sign of the rest will answer as though it saw the
 * backlog. Being told it did not is the difference between a partial answer
 * and a wrong one.
 */
export function page<Item>(items: readonly Item[], limit: number): Page<Item> {
  return {
    items: items.slice(0, limit),
    total: items.length,
    truncated: items.length > limit,
  }
}
