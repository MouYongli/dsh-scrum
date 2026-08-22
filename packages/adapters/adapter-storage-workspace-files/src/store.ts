import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  NotFoundError,
  ValidationError,
  isScrumError,
  type ErrorCode,
  type Project,
  type ProjectConfig,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import {
  decodeProjectConfig,
  decodeProjectFile,
  decodeSprint,
  decodeWorkItem,
  encodeProjectConfig,
  encodeProjectFile,
  type ProjectFile,
} from './codecs.js'
import { decodingFile } from './json.js'
import {
  layoutDirectories,
  realPathInside,
  resolveInside,
  workspaceLayout,
  type WorkspaceLayout,
} from './paths.js'

/** A file the scan could not read, and why. */
export interface StoreProblem {
  readonly file: string
  readonly code: ErrorCode
  readonly message: string
}

/**
 * Everything a project needs in memory, plus whatever could not be read.
 *
 * The problems travel with the result rather than aborting the scan. One
 * unreadable work item must not make a project unopenable — that is when a
 * user most needs the tool to start — but it must not vanish either, so the
 * caller gets both the items it can use and the files it has to be told about.
 */
export interface WorkspaceSnapshot {
  readonly project: Project
  readonly config: ProjectConfig
  readonly edition: ProjectFile['edition']
  readonly workItems: ReadonlyMap<WorkItemId, WorkItem>
  readonly sprints: ReadonlyMap<SprintId, Sprint>
  readonly problems: readonly StoreProblem[]
}

/** Whether the workspace is bound to a project, which is what `project.json` means. */
export async function isProjectInitialised(workspaceRoot: string): Promise<boolean> {
  return await exists(workspaceLayout(workspaceRoot).project)
}

export interface InitialiseProjectInput {
  readonly workspaceRoot: string
  readonly project: Project
  readonly config: ProjectConfig
  readonly edition: ProjectFile['edition']
}

/**
 * Creates the layout and writes the two files that define a bound project.
 *
 * `project.json` is created exclusively, so a second initialisation loses the
 * race rather than overwriting a project that is already there. Two Harness
 * windows opening the same fresh workspace is not a rare case, and the loser
 * has to find out from the filesystem rather than from a check it ran a moment
 * earlier.
 */
export async function initialiseProject(input: InitialiseProjectInput): Promise<WorkspaceLayout> {
  const layout = workspaceLayout(input.workspaceRoot)
  for (const directory of layoutDirectories(layout)) {
    await mkdir(directory, { recursive: true })
  }
  await realPathInside(layout.workspaceRoot, layout.scrum)

  await createFile(
    layout.project,
    encodeProjectFile({ project: input.project, edition: input.edition }),
  )
  await createFile(layout.config, encodeProjectConfig(input.config))
  return layout
}

export async function readProjectFile(workspaceRoot: string): Promise<ProjectFile> {
  const layout = workspaceLayout(workspaceRoot)
  return decodeProjectFile(await readJson(layout.workspaceRoot, layout.project, 'project'))
}

export async function readProjectConfig(workspaceRoot: string): Promise<ProjectConfig> {
  const layout = workspaceLayout(workspaceRoot)
  return decodeProjectConfig(await readJson(layout.workspaceRoot, layout.config, 'project config'))
}

/**
 * Reads every work item and sprint by walking their directories.
 *
 * A scan rather than an index file: an index is derived data, and one that
 * disagreed with the files would be believed. Rebuilding it on open costs a
 * read per item and cannot be wrong.
 */
export async function scanWorkspace(workspaceRoot: string): Promise<WorkspaceSnapshot> {
  const layout = workspaceLayout(workspaceRoot)
  const { project, edition } = await readProjectFile(workspaceRoot)
  const config = await readProjectConfig(workspaceRoot)
  const problems: StoreProblem[] = []

  const workItems = await readDirectoryInto(
    layout,
    layout.workItems,
    decodeWorkItem,
    (item) => item.id,
    problems,
  )
  const sprints = await readDirectoryInto(
    layout,
    layout.sprints,
    decodeSprint,
    (sprint) => sprint.id,
    problems,
  )
  return { project, config, edition, workItems, sprints, problems }
}

async function readDirectoryInto<Id extends string, Value>(
  layout: WorkspaceLayout,
  directory: string,
  decode: (raw: unknown) => Value,
  identify: (value: Value) => Id,
  problems: StoreProblem[],
): Promise<ReadonlyMap<Id, Value>> {
  const found = new Map<Id, Value>()
  for (const name of await listJsonFiles(directory)) {
    const file = resolveInside(directory, name)
    try {
      const value = decode(await readJson(layout.workspaceRoot, file, name))
      // The name is part of the addressing: a file read under one name that
      // claims another identifier would leave the index unable to find it
      // again, and a later write would create a second file for one entity.
      if (`${identify(value)}.json` !== basename(file)) {
        throw new ValidationError('file name does not match the identifier it holds', {
          file,
          id: identify(value),
        })
      }
      found.set(identify(value), value)
    } catch (error) {
      problems.push(asProblem(file, error))
    }
  }
  return found
}

async function listJsonFiles(directory: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if (isMissing(error)) {
      return []
    }
    throw error
  }
}

async function readJson(workspaceRoot: string, file: string, label: string): Promise<unknown> {
  await realPathInside(workspaceRoot, file)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (isMissing(error)) {
      throw new NotFoundError(label, file)
    }
    throw error
  }
  return decodingFile(file, () => {
    try {
      return JSON.parse(text) as unknown
    } catch (error) {
      throw new ValidationError(`file is not valid JSON: ${(error as Error).message}`, { file })
    }
  })
}

async function createFile(file: string, content: unknown): Promise<void> {
  try {
    await writeFile(file, `${JSON.stringify(content, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (isExisting(error)) {
      throw new ValidationError('the workspace is already bound to a project', { file })
    }
    throw error
  }
}

function asProblem(file: string, error: unknown): StoreProblem {
  if (isScrumError(error)) {
    return { file, code: error.code, message: error.message }
  }
  throw error
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file)
    return true
  } catch (error) {
    if (isMissing(error)) {
      return false
    }
    throw error
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === code
}

function isMissing(error: unknown): boolean {
  return hasCode(error, 'ENOENT')
}

function isExisting(error: unknown): boolean {
  return hasCode(error, 'EEXIST')
}
