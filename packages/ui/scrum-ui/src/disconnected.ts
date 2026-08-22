import type { ScrumClient } from './client.js'

/**
 * A client that answers nothing, for a shell that composed the browser half
 * without a channel to the host.
 *
 * It lives here rather than in the plugin that needs it so that adding a
 * method to `ScrumClient` breaks one file instead of every place that had to
 * spell out a stub. Every method rejects with the same sentence: a workbench
 * that opened and then did nothing is a bug report nobody can write, and one
 * that says it is not connected is one anybody can.
 */
export function disconnectedClient(message: string): ScrumClient {
  const refuse = (): Promise<never> => Promise.reject(new Error(message))
  return {
    entry: refuse,
    remoteProfiles: refuse,
    beginRemote: refuse,
    attachRemote: refuse,
    createProject: refuse,
    backlog: refuse,
    createWorkItem: refuse,
    updateWorkItem: refuse,
    setAcceptanceCriterion: refuse,
    moveWorkItemToRank: refuse,
    setWorkItemParent: refuse,
    setWorkItemDependency: refuse,
    blockWorkItem: refuse,
    moveWorkItemStatus: refuse,
    sprints: refuse,
    createSprint: refuse,
    planSprint: refuse,
    startSprint: refuse,
    closeSprint: refuse,
    authorization: refuse,
  }
}
