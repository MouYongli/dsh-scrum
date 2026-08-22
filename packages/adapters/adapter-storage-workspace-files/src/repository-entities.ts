import { rm } from 'node:fs/promises'
import {
  ConflictError,
  NotFoundError,
  formatSprintId,
  formatWorkItemId,
  projectKeyOf,
  toSprintId,
  toTimestamp,
  type ProjectId,
  type Revision,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import {
  filterWorkItems,
  type AtomicWrites,
  type SprintRepository,
  type TransactionPort,
  type WorkItemFilter,
  type WorkItemRepository,
} from '@dsh-scrum/scrum-application'
import { decodeSprint, decodeWorkItem, encodeSprint, encodeWorkItem } from './codecs.js'
import { runOperation } from './journal.js'
import { sprintFile, workItemFile, type WorkspaceLayout } from './paths.js'
import { readEntity, type Run } from './records.js'
import { scanWorkspace } from './store.js'
import { NEW_ENTITY, saveSprint, saveWorkItem } from './writes.js'

/**
 * Work items, read by scanning their directory.
 *
 * A filter is applied in memory over what the scan returned, through the
 * application's own `filterWorkItems`, so a store that can only scan applies
 * exactly the rule a store that could push the filter down would have to
 * reproduce.
 */
export function workItemRepository(
  root: string,
  layout: WorkspaceLayout,
  run: Run,
): WorkItemRepository {
  async function all(projectId: ProjectId): Promise<readonly WorkItem[]> {
    const snapshot = await scanWorkspace(root)
    return snapshot.project.id === projectId ? [...snapshot.workItems.values()] : []
  }

  return {
    find: async (projectId: ProjectId, id: WorkItemId) => {
      const item = await readEntity(workItemFile(layout, id), decodeWorkItem)
      return item === null || item.projectId !== projectId ? null : item
    },
    list: async (projectId: ProjectId, filter: WorkItemFilter) =>
      filterWorkItems(await all(projectId), filter),
    /**
     * The next number after the highest one that exists, not after the count,
     * so a gap left by a deletion in the middle is not filled in.
     *
     * Derived by scanning rather than from a stored counter: a counter is a
     * second answer that can disagree with the files, and the one time it
     * matters is after the crash that made them disagree. The cost is that
     * deleting the newest item frees its number to be issued again, which is
     * recorded as an open question — closing it needs somewhere to keep a
     * high-water mark, and that is a persisted format decision.
     */
    nextIdentifier: async () => {
      const snapshot = await scanWorkspace(root)
      const key = snapshot.project.key
      let highest = 0
      for (const id of snapshot.workItems.keys()) {
        const sequence = Number(id.slice(`${projectKeyOf(id)}-`.length))
        if (projectKeyOf(id) === key && Number.isSafeInteger(sequence) && sequence > highest) {
          highest = sequence
        }
      }
      return formatWorkItemId(key, highest + 1)
    },
    create: async (item: WorkItem) => {
      await run(async () => {
        await saveWorkItem(root, item, NEW_ENTITY)
      })
    },
    save: async (item: WorkItem, expected: Revision) => {
      await run(async () => {
        await saveWorkItem(root, item, expected)
      })
    },
    remove: async (projectId: ProjectId, id: WorkItemId, expected: Revision) => {
      await run(async () => {
        const file = workItemFile(layout, id)
        const item = await readEntity(file, decodeWorkItem)
        if (item === null || item.projectId !== projectId) {
          throw new NotFoundError('work item', id)
        }
        if (item.revision !== expected) {
          throw new ConflictError('the work item has changed', expected, item.revision, { id })
        }
        await rm(file)
      })
    },
  }
}

export function sprintRepository(
  root: string,
  layout: WorkspaceLayout,
  run: Run,
): SprintRepository {
  return {
    find: async (projectId: ProjectId, id: SprintId) => {
      const sprint = await readEntity(sprintFile(layout, id), decodeSprint)
      return sprint === null || sprint.projectId !== projectId ? null : sprint
    },
    list: async (projectId: ProjectId) => {
      const snapshot = await scanWorkspace(root)
      return snapshot.project.id === projectId ? [...snapshot.sprints.values()] : []
    },
    nextIdentifier: async () => {
      const snapshot = await scanWorkspace(root)
      let highest = 0
      for (const id of snapshot.sprints.keys()) {
        const sequence = Number(id.slice('sprint-'.length))
        if (Number.isSafeInteger(sequence) && sequence > highest) {
          highest = sequence
        }
      }
      return toSprintId(formatSprintId(highest + 1))
    },
    create: async (sprint: Sprint) => {
      await run(async () => {
        await saveSprint(root, sprint, NEW_ENTITY)
      })
    },
    save: async (sprint: Sprint, expected: Revision) => {
      await run(async () => {
        await saveSprint(root, sprint, expected)
      })
    },
  }
}

/**
 * Several entities as one operation, through the journal.
 *
 * The journal is what makes a crash recoverable: it is written in full before
 * any target changes, so a half-applied close is finished on the next open
 * rather than guessed at. The operation id is derived from the name and the
 * entities involved, so a retry after a crash resumes the same journal instead
 * of starting a second one beside it.
 */
export function transactionPort(layout: WorkspaceLayout, run: Run): TransactionPort {
  return {
    apply: async (operation: string, writes: AtomicWrites) => {
      const entries = [
        ...(writes.workItems ?? []).map((write) => ({
          file: workItemFile(layout, write.item.id),
          content: encodeWorkItem(write.item),
          expected: write.expected,
          id: String(write.item.id),
        })),
        ...(writes.sprints ?? []).map((write) => ({
          file: sprintFile(layout, write.sprint.id),
          content: encodeSprint(write.sprint),
          expected: write.expected,
          id: String(write.sprint.id),
        })),
      ]
      await run(async () => {
        await runOperation(layout, {
          id: `${operation}-${entries.map((entry) => entry.id).join('-')}`,
          kind: operation,
          at: toTimestamp(new Date().toISOString()),
          writes: entries.map(({ file, content, expected }) => ({ file, content, expected })),
        })
      })
    },
  }
}

/**
 * Which project this workspace is attached to, recorded once per Harness
 * installation.
 *
 * Almost all of it is derivable — the project is the one in this `.scrum/`,
 * and who created it and when are on the project itself. The path fingerprint
 * is not: it records where the workspace was when it was attached, and without
 * a stored copy the "this is not the same directory" report would compare the
 * current path with itself and never fire.
 */
