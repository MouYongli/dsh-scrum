import { randomBytes } from 'node:crypto'
import { timestampFromDate, type Clock, type IdGenerator } from '@dsh-scrum/scrum-domain'

/**
 * The clock and the identifier source, which are the two places a composition
 * has to reach for something the domain refuses to reach for itself.
 */
export const systemClock: Clock = {
  now: () => timestampFromDate(new Date()),
}

// Crockford base32 without I, L, O and U, which is what a ULID is spelled in.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_LENGTH = 10
const RANDOM_LENGTH = 16

function encodeTime(milliseconds: number): string {
  let value = milliseconds
  let encoded = ''
  for (let position = 0; position < TIME_LENGTH; position += 1) {
    encoded = `${ALPHABET[value % 32] ?? '0'}${encoded}`
    value = Math.floor(value / 32)
  }
  return encoded
}

/**
 * A ULID, so identifiers sort by the moment they were issued.
 *
 * That ordering is not decoration: directory listings, exports and backups all
 * come out in creation order without a separate sort key, and the identifier
 * grammar the domain enforces depends on the first character carrying the high
 * bits of a 48-bit millisecond timestamp.
 */
export function createUlidGenerator(now: () => number = Date.now): IdGenerator {
  return {
    nextUlid: () => {
      const random = [...randomBytes(RANDOM_LENGTH)]
        .map((byte) => ALPHABET[byte % 32] ?? '0')
        .join('')
      return `${encodeTime(now())}${random}`
    },
  }
}
