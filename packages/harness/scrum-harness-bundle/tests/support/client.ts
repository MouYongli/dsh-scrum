import { toProjectKey } from '@dsh-scrum/scrum-domain'
import type { ScrumHostApi } from '@dsh-scrum/scrum-harness-host'
import type { ScrumClient } from '@dsh-scrum/scrum-ui'

/**
 * The interface the screens are built against, over the host API.
 *
 * In process here because the browser channel is not settled yet (`todo.md`
 * A15 names the transport but the host cannot resolve the open workspace and
 * session for itself, which is A14). What this file is for is the other half
 * of the question: that the calls the screens make land on the same use cases
 * an agent's tools land on, against the same workspace, with the same
 * revisions. That part does not depend on how the bytes travel.
 */
export function clientOver(host: ScrumHostApi): ScrumClient {
  return {
    entry: async () => {
      const entry = await host.entry()
      switch (entry.state) {
        case 'no-workspace':
          return { state: 'no-workspace' }
        case 'unbound':
        case 'stale':
          return {
            state: entry.state,
            workspace: { id: entry.workspace.id, name: entry.workspace.name },
          }
        default:
          return {
            state: entry.state,
            workspace: { id: entry.workspace.id, name: entry.workspace.name },
            project: {
              id: entry.project.id,
              revision: entry.project.revision,
              key: entry.project.key,
              name: entry.project.name,
              description: entry.project.description,
            },
            moved: entry.moved,
          }
      }
    },
    remoteProfiles: async () => await host.remoteProfiles(),
    beginRemote: async (connectionId) => await host.beginRemote(connectionId),
    attachRemote: async (connectionId, projectId) => {
      await host.attachRemote(connectionId, projectId)
    },
    createProject: async (input) => {
      // The screen collects a string; the identifier grammar is the domain's,
      // and this is the boundary where one becomes the other.
      const stored = await host.initialise({ ...input, key: toProjectKey(input.key) })
      return {
        id: stored.project.id,
        revision: stored.project.revision,
        key: stored.project.key,
        name: stored.project.name,
        description: stored.project.description,
      }
    },
    updateProject: async (input) => {
      const stored = await host.updateProject(input)
      return {
        id: stored.project.id,
        revision: stored.project.revision,
        key: stored.project.key,
        name: stored.project.name,
        description: stored.project.description,
      }
    },
    backlog: async (query) => await host.backlog(query),
    createWorkItem: async (input) => await host.createWorkItem(input),
    updateWorkItem: async (command) => await host.updateWorkItem(command),
    setAcceptanceCriterion: async () => {
      throw new Error('the host does not expose acceptance criteria yet')
    },
    moveWorkItemToRank: async (command) => await host.moveWorkItemToRank(command),
    setWorkItemParent: async () => {
      throw new Error('the host does not expose parenthood yet')
    },
    setWorkItemDependency: async () => {
      throw new Error('the host does not expose dependencies yet')
    },
    blockWorkItem: async (command) => await host.blockWorkItem(command),
    moveWorkItemStatus: async (command) => await host.moveWorkItemStatus(command),
    sprints: async () => await host.sprints(),
    createSprint: async (input) => await host.createSprint(input),
    planSprint: async (command) => await host.planSprint(command),
    startSprint: async (command) => await host.startSprint(command),
    closeSprint: async (command) => await host.closeSprint(command),
    authorization: async () => {
      const authorization = await host.authorization()
      return {
        permissions: [...authorization.permissions],
        projectArchived: authorization.projectArchived,
        membership: authorization.membership,
      }
    },
  }
}
