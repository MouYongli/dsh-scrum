import {
  CAPABILITY,
  EDITION,
  newTenantId,
  type Capability,
  type CapabilitySet,
  type Clock,
  type IdGenerator,
  type IdentityId,
  type Project,
  type TenantId,
} from '@dsh-scrum/scrum-domain'
import type { ApplicationDependencies } from '@dsh-scrum/scrum-application'
import { createLocalActivityRecorder } from '@dsh-scrum/adapter-audit-local'
import { createPersonalIdentity } from '@dsh-scrum/adapter-identity-personal'
import {
  createDirectoryLockPort,
  createWorkspaceRepositories,
  createWriteCoordinator,
  readProjectFile,
  workspaceLayout,
  type FileLockPort,
} from '@dsh-scrum/adapter-storage-workspace-files'
import type { HarnessWorkspace, ScrumRuntime } from '@dsh-scrum/scrum-harness-host'
import { createUlidGenerator, systemClock } from './environment.js'

export { createUlidGenerator, systemClock } from './environment.js'

/**
 * What a Community installation is licensed to do.
 *
 * Declared here and nowhere else. The domain defines the vocabulary and never
 * constructs a set, because which capabilities an edition grants is a
 * composition decision; a constant in the domain would put the commercial
 * matrix below the composition boundary and let one build behave differently
 * from another running the same rules.
 *
 * Collaboration, RBAC, realtime and the enterprise identity capabilities are
 * absent because the features behind them are: a single local user has nobody
 * to collaborate with and no directory to synchronise against. Audit is
 * present at the basic level, which is what a local activity log is.
 */
export const COMMUNITY_CAPABILITIES: readonly Capability[] = [
  CAPABILITY.core,
  CAPABILITY.auditBasic,
]

const GRANTED = new Set<Capability>(COMMUNITY_CAPABILITIES)

export const communityCapabilities: CapabilitySet = {
  has: (capability: Capability) => GRANTED.has(capability),
}

export interface CommunityRuntimeInput {
  /** Serialises writes between processes. Overridden only by tests. */
  readonly lock?: FileLockPort | undefined
  readonly clock?: Clock | undefined
  readonly ids?: IdGenerator | undefined
}

/**
 * The Community composition: adapters and capabilities, and no rules.
 *
 * Every port is satisfied by something that already exists — the workspace
 * file store, the personal identity, the local activity log. Nothing here
 * decides what is allowed or what a valid change is; that lives in the domain
 * and the use cases, and a composition that started answering those questions
 * would be a second implementation of them that only one edition ever ran.
 *
 * There is no realtime publisher. The application declares no port for one,
 * because nothing consumes realtime events yet: publishing is a Teams
 * capability served by a remote service, and a no-op port with no caller would
 * be an abstraction invented for a diagram rather than for a use.
 */
export function createCommunityRuntime(input: CommunityRuntimeInput = {}): ScrumRuntime {
  const clock = input.clock ?? systemClock
  const ids = input.ids ?? createUlidGenerator()
  const lock = input.lock ?? createDirectoryLockPort()

  /**
   * Composed per call rather than cached per workspace. A workspace that is
   * closed and reopened, or moved, must not keep writing through handles to a
   * directory that is no longer there — and the coordinator's in-process queue
   * is per composition, so a stale one would serialise against writers that
   * have gone away.
   */
  function dependenciesFor(workspace: HarnessWorkspace): ApplicationDependencies {
    const root = workspace.path
    return {
      ...createWorkspaceRepositories({
        workspaceRoot: root,
        coordinator: createWriteCoordinator(workspaceLayout(root), lock),
        edition: EDITION.community,
      }),
      activity: createLocalActivityRecorder(root),
      capabilities: communityCapabilities,
      clock,
      ids,
    }
  }

  /** The project a workspace holds, or `null` when it holds none yet. */
  async function projectOf(workspace: HarnessWorkspace): Promise<Project | null> {
    try {
      return (await readProjectFile(workspace.path)).project
    } catch {
      return null
    }
  }

  return {
    identity: async (workspace: HarnessWorkspace): Promise<IdentityId> =>
      await createPersonalIdentity({
        ids,
        port: { creator: async () => (await projectOf(workspace))?.createdBy ?? null },
      }).identity(),
    /**
     * One personal tenant per workspace, minted the first time a project is
     * created there and read back from that project afterwards. Nothing else
     * stores it: the project is where a tenant is recorded, and a second copy
     * beside it would be a second answer with nothing keeping the two in step.
     */
    tenant: async (workspace: HarnessWorkspace): Promise<TenantId> =>
      (await projectOf(workspace))?.tenantId ?? newTenantId(ids),
    forWorkspace: async (workspace: HarnessWorkspace) =>
      await Promise.resolve(dependenciesFor(workspace)),
  }
}
