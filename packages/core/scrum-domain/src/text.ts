import { ValidationError } from './errors.js'

// A stored title carrying a newline or a NUL breaks single-line rendering on
// the board and can smuggle a terminator byte into a JSONL line. Rejecting
// them at the edge keeps every later layer from having to sanitise.
//
// Written as a code point scan rather than a regular expression: a character
// class of raw control bytes is invisible in a diff, which is how a range ends
// up widened by accident.
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

/**
 * Shared guard for the short human-authored strings entities carry: names,
 * titles and summaries. Internal — each caller exposes its own field rule
 * instead, the same way `integers.ts` backs the branded counters.
 *
 * The trimmed value is returned, so surrounding whitespace can never become a
 * stored difference between two otherwise identical names.
 */
export function requireText(value: string, label: string, maxLength: number): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} must not be empty`, { value })
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${label} must be at most ${maxLength} characters`, {
      value,
      maxLength,
    })
  }
  if (hasControlCharacter(trimmed)) {
    throw new ValidationError(`${label} must not contain control characters`, { value })
  }
  return trimmed
}

/**
 * The same rule for a field that is allowed to be absent. An empty string is
 * the stored spelling of "absent", so it is accepted and normalised rather
 * than rejected: a description is optional and must not be forced to a null.
 */
export function requireOptionalText(value: string, label: string, maxLength: number): string {
  const trimmed = value.trim()
  return trimmed.length === 0 ? '' : requireText(trimmed, label, maxLength)
}
