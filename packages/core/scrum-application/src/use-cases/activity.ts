import { PERMISSION, type ProjectId } from '@dsh-scrum/scrum-domain'
import type { UseCaseRequest } from '../actor.js'
import { authorizeProject } from '../authorization.js'
import type { ApplicationDependencies } from '../dependencies.js'
import type { ActivityHistory, ActivityWindow } from '../ports/activity.js'

type Dependencies = Pick<
  ApplicationDependencies,
  'projects' | 'members' | 'capabilities' | 'activity'
>

/** How much of the history is wanted, and about which project. */
export interface RecentActivityCommand extends ActivityWindow {
  readonly projectId: ProjectId
}

/**
 * The most recent changes, newest first.
 *
 * `project.view` rather than a permission of its own: the activity log says
 * who changed what, and everything it names is already visible to anyone who
 * can open the project. A separate permission would suggest the log holds
 * something the project does not, which it does not.
 *
 * Nothing is recorded. Activity is a record of change, and a log that also
 * held every read of itself would bury the changes in it.
 *
 * The log's own problems come back with the events rather than as a failure.
 * A history missing one unreadable line is still the history, and a page that
 * refused to render because of it would tell the user less than one that
 * showed what it has and said what it could not read.
 */
export async function recentActivity(
  deps: Dependencies,
  request: UseCaseRequest<RecentActivityCommand>,
): Promise<ActivityHistory> {
  const { command } = request
  await authorizeProject(deps, request.actor, command.projectId, PERMISSION.projectView)
  return await deps.activity.read({
    limit: command.limit,
    ...(command.since === undefined ? {} : { since: command.since }),
  })
}
