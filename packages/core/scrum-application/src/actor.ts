import type { IdentityId } from '@dsh-scrum/scrum-domain'
import type { ActivitySource } from './ports/activity.js'

/**
 * Who is asking, and through which door.
 *
 * Every use case takes one. It carries no tenant: a tenant is chosen once,
 * when a project is created, and afterwards belongs to the project. Repeating
 * it on the actor would give every later call a second source of truth that
 * could disagree with the stored one.
 *
 * `sessionId` is null for a change made outside any Harness session, and is
 * what makes a change an agent made traceable back to the conversation that
 * asked for it.
 */
export interface ActorContext {
  readonly identityId: IdentityId
  readonly source: ActivitySource
  readonly sessionId: string | null
}

/**
 * One call into a use case.
 *
 * The idempotency key is optional because most calls do not need one, but a
 * caller that may retry without knowing whether the first attempt landed must
 * supply one. See `runIdempotently`.
 */
export interface UseCaseRequest<Command> {
  readonly actor: ActorContext
  readonly command: Command
  readonly idempotencyKey?: string | undefined
}
