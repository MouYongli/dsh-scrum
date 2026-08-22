import type { ActorContext } from './actor.js'
import type { ApplicationDependencies } from './dependencies.js'
import type { ActivityDescription } from './ports/activity.js'

type Dependencies = Pick<ApplicationDependencies, 'activity' | 'clock'>

/**
 * Records what an actor just did.
 *
 * Called after the change has landed, and a failure here is not swallowed. The
 * alternative is a history with silent gaps, which is precisely what an audit
 * trail exists to rule out; a caller told the write failed can retry, and the
 * retry is safe because a stale revision conflicts rather than duplicating.
 *
 * The actor and the source come from the context rather than from the caller,
 * so a use case cannot record a change as having come from somewhere else.
 */
export async function recordActivity(
  deps: Dependencies,
  actor: ActorContext,
  description: ActivityDescription,
): Promise<void> {
  await deps.activity.record({
    ...description,
    at: deps.clock.now(),
    actorId: actor.identityId,
    source: actor.source,
    sessionId: actor.sessionId,
  })
}
