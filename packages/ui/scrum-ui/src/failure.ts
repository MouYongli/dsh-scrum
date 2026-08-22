import { ERROR_CODE, type ErrorCode } from '@dsh-scrum/scrum-domain'

/**
 * What went wrong, in the terms the interface reacts to.
 *
 * A conflict is separated from everything else because it is the only failure
 * with a next step the user can take: the screen refreshes and shows what
 * somebody else wrote. The rest differ only in the sentence shown.
 */
export type ScrumFailure =
  | { readonly kind: 'conflict'; readonly message: string }
  | { readonly kind: 'forbidden'; readonly message: string }
  | { readonly kind: 'missing'; readonly message: string }
  | { readonly kind: 'other'; readonly message: string }

interface CodedError {
  readonly code: unknown
  readonly message?: unknown
}

/**
 * Read structurally rather than with `instanceof`.
 *
 * The client interface is satisfied both in-process and across a transport,
 * and an error that has been serialized and rebuilt on the other side is the
 * same failure. A check that only recognised the class would classify every
 * remote conflict as an unknown failure, which is exactly the case where
 * telling the user to refresh matters.
 */
function codeOf(error: unknown): ErrorCode | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }
  const code = (error as CodedError).code
  return typeof code === 'string' && CODES.includes(code) ? (code as ErrorCode) : null
}

const CODES: readonly string[] = Object.values(ERROR_CODE)

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as CodedError).message === 'string'
  ) {
    return (error as CodedError).message as string
  }
  return String(error)
}

export function toFailure(error: unknown): ScrumFailure {
  const message = messageOf(error)
  switch (codeOf(error)) {
    case ERROR_CODE.conflict:
      return { kind: 'conflict', message }
    case ERROR_CODE.forbidden:
      return { kind: 'forbidden', message }
    case ERROR_CODE.notFound:
      return { kind: 'missing', message }
    default:
      return { kind: 'other', message }
  }
}
