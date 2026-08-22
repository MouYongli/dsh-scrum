import { rm } from 'node:fs/promises'
import {
  ConflictError,
  INITIAL_REVISION,
  toIdentityId,
  toProjectId,
  toTimestamp,
} from '@dsh-scrum/scrum-domain'
import {
  type IdempotencyKey,
  type IdempotencyRecord,
  type IdempotencyStore,
  type WorkspaceBinding,
  type WorkspaceBindingRepository,
  type WorkspaceRef,
} from '@dsh-scrum/scrum-application'
import { stringField } from './json.js'
import { digestFileName, resolveInside, type WorkspaceLayout } from './paths.js'
import { RECORD_SCHEMA_VERSION, readJsonFile, writeRecord, type Run } from './records.js'

export function bindingRepository(layout: WorkspaceLayout, run: Run): WorkspaceBindingRepository {
  function file(workspace: WorkspaceRef): string {
    return resolveInside(layout.bindings, digestFileName(workspace.instanceId))
  }

  return {
    find: async (workspace: WorkspaceRef) => {
      const record = await readJsonFile(file(workspace))
      if (record === null) {
        return null
      }
      const binding: WorkspaceBinding = {
        workspace: {
          instanceId: stringField(record, 'instanceId'),
          workspaceId: stringField(record, 'workspaceId'),
        },
        projectId: toProjectId(stringField(record, 'projectId')),
        linkedBy: toIdentityId(stringField(record, 'linkedBy')),
        linkedAt: toTimestamp(stringField(record, 'linkedAt')),
        pathFingerprint: stringField(record, 'pathFingerprint'),
      }
      return binding.workspace.workspaceId === workspace.workspaceId ? binding : null
    },
    save: async (binding: WorkspaceBinding) => {
      await run(async () => {
        await writeRecord(file(binding.workspace), {
          schemaVersion: RECORD_SCHEMA_VERSION,
          instanceId: binding.workspace.instanceId,
          workspaceId: binding.workspace.workspaceId,
          projectId: binding.projectId,
          linkedBy: binding.linkedBy,
          linkedAt: binding.linkedAt,
          pathFingerprint: binding.pathFingerprint,
        })
      })
    },
    /**
     * Removing the record leaves the project where it is. That is the whole
     * difference between detaching and deleting, and it is why this is allowed
     * here even though Community's project data never moves: what goes away is
     * the note saying this installation had attached to it.
     */
    remove: async (workspace: WorkspaceRef) => {
      await run(async () => {
        await rm(file(workspace), { force: true })
      })
    },
  }
}

/**
 * One file per session, under a directory per Harness installation.
 *
 * Session ids are unique only inside one installation, so a flat directory
 * would let two machines share an answer neither of them gave. Both path
 * segments are digests: `.scrum/` is committed, and neither an installation id
 * nor a conversation id belongs in a directory listing.
 */
/**
 * Completed operations, remembered on disk rather than in memory.
 *
 * A retry usually follows a failure, and a failure often follows a restart.
 * An in-memory record would be gone exactly when the caller comes back with
 * the same key, which is the case the key exists for.
 */
export function idempotencyStore(layout: WorkspaceLayout, run: Run): IdempotencyStore {
  function file(key: IdempotencyKey): string {
    return resolveInside(layout.idempotency, digestFileName(key))
  }

  return {
    find: async (key: IdempotencyKey) => {
      const record = await readJsonFile(file(key))
      if (record === null) {
        return null
      }
      const stored: IdempotencyRecord = {
        key: stringField(record, 'key') as IdempotencyKey,
        action: stringField(record, 'action'),
        actorId: toIdentityId(stringField(record, 'actorId')),
        at: toTimestamp(stringField(record, 'at')),
        reference: record['reference'] as IdempotencyRecord['reference'],
      }
      return stored.key === key ? stored : null
    },
    /** Refuses a key that is already stored, so two racing callers cannot both proceed. */
    save: async (record: IdempotencyRecord) => {
      await run(async () => {
        const target = file(record.key)
        if ((await readJsonFile(target)) !== null) {
          throw new ConflictError(
            'the idempotency key is already recorded',
            INITIAL_REVISION,
            INITIAL_REVISION,
            { action: record.action },
          )
        }
        await writeRecord(target, { schemaVersion: RECORD_SCHEMA_VERSION, ...record })
      })
    },
  }
}
