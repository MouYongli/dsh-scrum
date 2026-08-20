import type { Brand } from './brand.js'
import { ValidationError } from './errors.js'

/**
 * Canonical UTC instant, always spelled `YYYY-MM-DDTHH:MM:SS.sssZ`. Fixing the
 * width and the zone means stored values compare correctly as plain strings
 * and a round trip through storage never rewrites the field.
 */
export type Timestamp = Brand<string, 'Timestamp'>

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

/**
 * Port for reading the current time. The domain never calls `Date.now`, so
 * every rule that depends on the clock stays testable.
 */
export interface Clock {
  now(): Timestamp
}

export function timestampFromDate(date: Date): Timestamp {
  const time = date.getTime()
  if (!Number.isFinite(time)) {
    throw new ValidationError('Timestamp must come from a valid date', { value: String(date) })
  }
  return date.toISOString() as Timestamp
}

/**
 * Accepts a UTC ISO-8601 instant with or without milliseconds and normalizes
 * it to the canonical form. Offsets such as `+02:00` are rejected rather than
 * converted, because a stored local time is almost always a bug upstream.
 */
export function toTimestamp(value: string): Timestamp {
  if (!ISO_UTC.test(value)) {
    throw new ValidationError('Timestamp must be a UTC ISO-8601 instant ending in Z', { value })
  }
  const parsed = new Date(value)
  // `Date` rolls an out-of-range day over silently: 2026-02-30 parses as
  // 2026-03-02. Comparing the calendar date back turns that into a rejection
  // instead of a date the caller never wrote.
  if (!Number.isFinite(parsed.getTime()) || !parsed.toISOString().startsWith(value.slice(0, 10))) {
    throw new ValidationError('Timestamp must name a real calendar date', { value })
  }
  return parsed.toISOString() as Timestamp
}

export function timestampToDate(value: Timestamp): Date {
  return new Date(value)
}

/** Orders two instants. Negative when `left` is earlier, as `Array#sort` expects. */
export function compareTimestamps(left: Timestamp, right: Timestamp): number {
  return left < right ? -1 : left > right ? 1 : 0
}
