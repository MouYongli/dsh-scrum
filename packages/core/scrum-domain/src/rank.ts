import type { Brand } from './brand.js'
import { ValidationError } from './errors.js'

/**
 * Backlog ordering key. Comparing two ranks as plain strings gives the backlog
 * order, and a new rank can always be produced strictly between two existing
 * ones, so dragging one item rewrites one file instead of renumbering its
 * neighbours.
 */
export type Rank = Brand<string, 'Rank'>

// Digits before lowercase letters, which is also their byte order, so a plain
// string comparison is the ordering. No uppercase and no separators: a second
// spelling of the same position is a second sort order waiting to happen.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const RANK = /^[0-9a-z]+$/

// A midpoint never needs to grow without bound in practice, but a corrupted
// store could hold ranks that force it to. The cap turns that into a rejected
// write rather than a string that grows on every reorder.
const MAX_LENGTH = 64

/**
 * A trailing zero is refused because it names a position that already has a
 * shorter spelling: `a` and `a0` sort as equals under this alphabet, and the
 * midpoint algorithm relies on every position having exactly one name.
 */
export function toRank(value: string): Rank {
  if (!RANK.test(value)) {
    throw new ValidationError('Rank must be one or more digits and lowercase letters', { value })
  }
  if (value.endsWith('0')) {
    throw new ValidationError('Rank must not end in a zero', { value })
  }
  if (value.length > MAX_LENGTH) {
    throw new ValidationError(`Rank must be at most ${MAX_LENGTH} characters`, { value })
  }
  return value as Rank
}

function digitAt(value: string, index: number): number {
  const character = value[index]
  return character === undefined ? 0 : ALPHABET.indexOf(character)
}

/**
 * The string strictly between `lower` and `upper`, where an empty `lower` means
 * "before everything" and a null `upper` means "after everything".
 *
 * This is fractional indexing rather than a bucketed scheme such as LexoRank.
 * A midpoint always exists, so there is no state where the backlog has to be
 * renumbered to make room; the cost is that a rank grows by a character each
 * time an item is dropped into the same gap, which the length cap bounds.
 */
function midpoint(lower: string, upper: string | null): string {
  if (upper !== null && lower >= upper) {
    throw new ValidationError('rank bounds are out of order', { lower, upper })
  }

  if (upper !== null) {
    let shared = 0
    while (digitAt(lower, shared) === digitAt(upper, shared) && shared < upper.length) {
      shared += 1
    }
    if (shared > 0) {
      return upper.slice(0, shared) + midpoint(lower.slice(shared), upper.slice(shared))
    }
  }

  const lowerDigit = digitAt(lower, 0)
  const upperDigit = upper === null ? ALPHABET.length : digitAt(upper, 0)

  if (upperDigit - lowerDigit > 1) {
    const middle = Math.round((lowerDigit + upperDigit) / 2)
    return ALPHABET[middle] as string
  }
  // The digits are adjacent, so the answer has to be longer than the bound it
  // sits next to: either the head of `upper`, or `lower` extended downwards.
  if (upper !== null && upper.length > 1) {
    return upper.slice(0, 1)
  }
  return (ALPHABET[lowerDigit] as string) + midpoint(lower.slice(1), null)
}

/**
 * A rank strictly between its neighbours. Both bounds are optional: passing
 * neither ranks the only item in a list, and passing one ranks an item at
 * either end.
 */
export function rankBetween(before: Rank | null, after: Rank | null): Rank {
  return toRank(midpoint(before ?? '', after))
}

/** Backlog order for two ranks, suitable for `Array.prototype.sort`. */
export function compareRanks(left: Rank, right: Rank): number {
  return left < right ? -1 : left > right ? 1 : 0
}
