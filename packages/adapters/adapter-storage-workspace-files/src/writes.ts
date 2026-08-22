import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ConflictError,
  INITIAL_REVISION,
  PROJECT_STATUS,
  SPRINT_STATUS,
  ValidationError,
  assertSupportedSchemaVersion,
  isSprintActive,
  toRevision,
  type EntityMetadata,
  type Project,
  type ProjectConfig,
  type ProjectId,
  type Revision,
  type Sprint,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'
import { writeFileAtomically } from './atomic.js'
import {
  decodeSprint,
  encodeProjectConfig,
  encodeProjectFile,
  encodeSprint,
  encodeWorkItem,
  type ProjectFile,
} from './codecs.js'
import { asRecord, decodingFile, numberField } from './json.js'
import { readProjectFile } from './store.js'
import {
  realPathInside,
  sprintFile,
  workItemFile,
  workspaceLayout,
  type WorkspaceLayout,
} from './paths.js'

/** Marks a write that must create the entity rather than replace one. */
export const NEW_ENTITY = 'new'

/**
 * What the caller believes it is replacing: the revision it read, or that the
 * entity is not there at all. There is no third option — a write with no
 * expectation is a write that can silently discard someone else's change.
 */
export type WriteExpectation = Revision | typeof NEW_ENTITY

export async function saveWorkItem(
  workspaceRoot: string,
  item: WorkItem,
  expected: WriteExpectation,
): Promise<void> {
  const layout = workspaceLayout(workspaceRoot)
  const project = await requireWritableProject(workspaceRoot)
  assertBelongsToProject(project.id, item.projectId, item.id)
  await write(layout, workItemFile(layout, item.id), item, expected, encodeWorkItem(item))
}

export async function saveSprint(
  workspaceRoot: string,
  sprint: Sprint,
  expected: WriteExpectation,
): Promise<void> {
  const layout = workspaceLayout(workspaceRoot)
  const project = await requireWritableProject(workspaceRoot)
  assertBelongsToProject(project.id, sprint.projectId, sprint.id)
  if (isSprintActive(sprint)) {
    await assertNoOtherActiveSprint(layout, sprint)
  }
  await write(layout, sprintFile(layout, sprint.id), sprint, expected, encodeSprint(sprint))
}

export async function saveProject(
  workspaceRoot: string,
  file: ProjectFile,
  expected: Revision,
): Promise<void> {
  const layout = workspaceLayout(workspaceRoot)
  await write(layout, layout.project, file.project, expected, encodeProjectFile(file))
}

export async function saveProjectConfig(
  workspaceRoot: string,
  config: ProjectConfig,
  expected: Revision,
): Promise<void> {
  const layout = workspaceLayout(workspaceRoot)
  const project = await requireWritableProject(workspaceRoot)
  assertBelongsToProject(project.id, config.projectId, 'config.json')
  await write(layout, layout.config, config, expected, encodeProjectConfig(config))
}

/**
 * The write itself: check what is on disk against what the caller expected,
 * confirm the revision advanced by exactly one, then replace the file.
 *
 * The expected revision is also the token the temporary file is named after,
 * so two writers working from the same read collide on the create rather than
 * both getting this far.
 */
async function write(
  layout: WorkspaceLayout,
  file: string,
  entity: EntityMetadata,
  expected: WriteExpectation,
  content: unknown,
): Promise<void> {
  await realPathInside(layout.workspaceRoot, file)
  const stored = await readStoredRevision(file)

  if (expected === NEW_ENTITY) {
    if (stored !== null) {
      throw new ConflictError('the entity already exists', INITIAL_REVISION, stored, { file })
    }
    if (entity.revision !== INITIAL_REVISION) {
      throw new ValidationError('a new entity must start at the initial revision', {
        file,
        revision: entity.revision,
      })
    }
  } else {
    if (stored === null) {
      throw new ConflictError('the entity is no longer there', expected, 0, { file })
    }
    if (stored !== expected) {
      throw new ConflictError('the entity changed since it was read', expected, stored, { file })
    }
    // Catches a caller that reused a value it had already written, which would
    // otherwise leave two different states sharing one revision number.
    if (entity.revision !== expected + 1) {
      throw new ValidationError('a write must advance the revision by exactly one', {
        file,
        expectedRevision: expected,
        revision: entity.revision,
      })
    }
  }

  await writeFileAtomically(file, `${JSON.stringify(content, null, 2)}\n`, String(expected))
}

/**
 * The stored revision, or `null` when the file is not there.
 *
 * Only the schema version and the revision are decoded. A file corrupt in some
 * other field still has to have its revision honoured, so that repairing it is
 * a normal write rather than something that needs the check disabled — while a
 * file from a newer build is still refused, because overwriting one would
 * destroy data this build cannot even read.
 */
async function readStoredRevision(file: string): Promise<Revision | null> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      return null
    }
    throw error
  }
  return decodingFile(file, () => {
    const record = asRecord(JSON.parse(text), file)
    assertSupportedSchemaVersion(numberField(record, 'schemaVersion'))
    return toRevision(numberField(record, 'revision'))
  })
}

async function requireWritableProject(workspaceRoot: string): Promise<Project> {
  const { project } = await readProjectFile(workspaceRoot)
  if (project.status === PROJECT_STATUS.archived) {
    throw new ValidationError('the project is archived and does not accept writes', {
      projectId: project.id,
    })
  }
  return project
}

/**
 * An entity carrying another project's identifier means the caller is writing
 * into the wrong workspace. Nothing downstream would notice: the file lands in
 * a valid location and reads back cleanly.
 */
function assertBelongsToProject(bound: ProjectId, claimed: ProjectId, entity: string): void {
  if (bound !== claimed) {
    throw new ValidationError('the entity belongs to a different project', {
      entity,
      projectId: claimed,
      boundProjectId: bound,
    })
  }
}

/**
 * The one invariant a per-file revision check cannot cover, so the store
 * checks it where the write happens. Sprints are few, so reading them all is
 * cheap; the same approach for work items would not be.
 */
async function assertNoOtherActiveSprint(layout: WorkspaceLayout, sprint: Sprint): Promise<void> {
  let names: readonly string[]
  try {
    names = (await readdir(layout.sprints)).filter((name) => name.endsWith('.json'))
  } catch {
    return
  }
  for (const name of names) {
    const file = join(layout.sprints, name)
    if (file === sprintFile(layout, sprint.id)) {
      continue
    }
    const raw = await readFile(file, 'utf8')
    const other = decodingFile(file, () => decodeSprint(JSON.parse(raw)))
    if (other.status === SPRINT_STATUS.active) {
      throw new ValidationError('the project already has an active sprint', {
        sprintId: sprint.id,
        activeSprintId: other.id,
      })
    }
  }
}
