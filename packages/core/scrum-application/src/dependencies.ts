import type { CapabilitySet, Clock, IdGenerator } from '@dsh-scrum/scrum-domain'
import type { ActivityRecorder } from './ports/activity.js'
import type { IdempotencyStore } from './ports/idempotency.js'
import type { MemberRepository } from './ports/members.js'
import type { ProjectRepository } from './ports/projects.js'
import type { WorkItemRepository } from './ports/work-items.js'
import type { WorkspaceBindingRepository } from './ports/workspace.js'

/**
 * Everything the use cases reach the outside world through.
 *
 * One bundle rather than a parameter list, and each use case declares the
 * subset it needs with `Pick`. That keeps a signature honest about what it
 * touches — a use case that names only `projects` cannot quietly start
 * writing activity — without inventing a named interface per combination.
 *
 * The capability set is here rather than on the actor because it describes the
 * installation, not the person: every actor in one Community workspace has the
 * same capabilities, and a remote connection reports them once at handshake.
 */
export interface ApplicationDependencies {
  readonly projects: ProjectRepository
  readonly workItems: WorkItemRepository
  readonly members: MemberRepository
  readonly bindings: WorkspaceBindingRepository
  readonly activity: ActivityRecorder
  readonly idempotency: IdempotencyStore
  readonly capabilities: CapabilitySet
  readonly clock: Clock
  readonly ids: IdGenerator
}
