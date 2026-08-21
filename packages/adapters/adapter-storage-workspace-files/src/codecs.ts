import {
  assertSupportedSchemaVersion,
  toEdition,
  toEstimationMethod,
  toIdentityId,
  toPermissionPolicy,
  toPriority,
  toProjectId,
  toProjectKey,
  toProjectStatus,
  toRank,
  toRevision,
  toSprintId,
  toSprintStatus,
  toTenantId,
  toTimestamp,
  toWorkItemId,
  toWorkItemStatus,
  toWorkItemType,
  type AcceptanceCriterion,
  type Edition,
  type EntityMetadata,
  type Project,
  type ProjectConfig,
  type Sprint,
  type WorkItem,
  type WorkItemStatus,
} from '@dsh-scrum/scrum-domain'
import {
  arrayField,
  asRecord,
  booleanField,
  numberField,
  nullableField,
  stringArrayField,
  stringField,
  type JsonRecord,
} from './json.js'

/**
 * The schema version is read before anything else, so a file written by a
 * newer build is refused as such instead of failing on whichever field that
 * build added. Those are different problems: one needs a migration or a newer
 * plugin, the other needs the file repaired.
 */
function metadata(record: JsonRecord): EntityMetadata {
  return {
    schemaVersion: assertSupportedSchemaVersion(numberField(record, 'schemaVersion')),
    revision: toRevision(numberField(record, 'revision')),
    createdAt: toTimestamp(stringField(record, 'createdAt')),
    updatedAt: toTimestamp(stringField(record, 'updatedAt')),
  }
}

/**
 * `project.json` holds the project and the edition that produced it. Community
 * keeps no separate tenant file: the tenant is implicit and personal, so its
 * identifier and the edition label ride here, which is also what makes an
 * exported project self-describing.
 */
export interface ProjectFile {
  readonly project: Project
  readonly edition: Edition
}

export function decodeProjectFile(raw: unknown): ProjectFile {
  const record = asRecord(raw, 'project.json')
  return {
    project: {
      ...metadata(record),
      // The one place a primary key is not stored as `id`, so that a file
      // naming several entities cannot be ambiguous about which one it means.
      id: toProjectId(stringField(record, 'projectId')),
      tenantId: toTenantId(stringField(record, 'tenantId')),
      key: toProjectKey(stringField(record, 'key')),
      name: stringField(record, 'name'),
      description: stringField(record, 'description'),
      status: toProjectStatus(stringField(record, 'status')),
      createdBy: toIdentityId(stringField(record, 'createdBy')),
    },
    edition: toEdition(stringField(record, 'edition')),
  }
}

export function encodeProjectFile(file: ProjectFile): JsonRecord {
  const { id, ...rest } = file.project
  return { ...rest, projectId: id, edition: file.edition }
}

export function decodeProjectConfig(raw: unknown): ProjectConfig {
  const record = asRecord(raw, 'config.json')
  return {
    ...metadata(record),
    projectId: toProjectId(stringField(record, 'projectId')),
    statuses: stringArrayField(record, 'statuses').map(toWorkItemStatus),
    statusDisplayNames: decodeStatusDisplayNames(record),
    estimationMethod: toEstimationMethod(stringField(record, 'estimationMethod')),
    sprintLengthInDays: numberField(record, 'sprintLengthInDays'),
    definitionOfDone: [...stringArrayField(record, 'definitionOfDone')],
    workInProgressLimit: nullableField(record, 'workInProgressLimit', numberField),
    permissionPolicy: toPermissionPolicy(decodePermissionPolicy(record)),
  }
}

function decodeStatusDisplayNames(
  record: JsonRecord,
): Readonly<Partial<Record<WorkItemStatus, string>>> {
  const raw = asRecord(record['statusDisplayNames'], 'statusDisplayNames')
  const names: Partial<Record<WorkItemStatus, string>> = {}
  for (const status of Object.keys(raw)) {
    names[toWorkItemStatus(status)] = stringField(raw, status)
  }
  return names
}

function decodePermissionPolicy(record: JsonRecord): Record<string, readonly string[]> {
  const raw = asRecord(record['permissionPolicy'], 'permissionPolicy')
  const policy: Record<string, readonly string[]> = {}
  for (const permission of Object.keys(raw)) {
    policy[permission] = stringArrayField(raw, permission)
  }
  return policy
}

export function encodeProjectConfig(config: ProjectConfig): JsonRecord {
  return { ...config }
}

export function decodeWorkItem(raw: unknown): WorkItem {
  const record = asRecord(raw, 'work item')
  return {
    ...metadata(record),
    id: toWorkItemId(stringField(record, 'id')),
    projectId: toProjectId(stringField(record, 'projectId')),
    type: toWorkItemType(stringField(record, 'type')),
    title: stringField(record, 'title'),
    description: stringField(record, 'description'),
    status: toWorkItemStatus(stringField(record, 'status')),
    priority: toPriority(stringField(record, 'priority')),
    assigneeId: mapNullable(record, 'assigneeId', stringField, toIdentityId),
    reporterId: toIdentityId(stringField(record, 'reporterId')),
    estimate: nullableField(record, 'estimate', numberField),
    sprintId: mapNullable(record, 'sprintId', stringField, toSprintId),
    parentId: mapNullable(record, 'parentId', stringField, toWorkItemId),
    dependsOn: stringArrayField(record, 'dependsOn').map(toWorkItemId),
    rank: toRank(stringField(record, 'rank')),
    blockedReason: nullableField(record, 'blockedReason', stringField),
    labels: [...stringArrayField(record, 'labels')],
    acceptanceCriteria: decodeAcceptanceCriteria(record),
  }
}

function decodeAcceptanceCriteria(record: JsonRecord): readonly AcceptanceCriterion[] {
  return arrayField(record, 'acceptanceCriteria').map((entry, index) => {
    const criterion = asRecord(entry, `acceptanceCriteria[${index}]`)
    return { text: stringField(criterion, 'text'), satisfied: booleanField(criterion, 'satisfied') }
  })
}

export function encodeWorkItem(item: WorkItem): JsonRecord {
  return { ...item }
}

export function decodeSprint(raw: unknown): Sprint {
  const record = asRecord(raw, 'sprint')
  return {
    ...metadata(record),
    id: toSprintId(stringField(record, 'id')),
    projectId: toProjectId(stringField(record, 'projectId')),
    name: stringField(record, 'name'),
    goal: stringField(record, 'goal'),
    status: toSprintStatus(stringField(record, 'status')),
    startDate: toTimestamp(stringField(record, 'startDate')),
    endDate: toTimestamp(stringField(record, 'endDate')),
    startedAt: mapNullable(record, 'startedAt', stringField, toTimestamp),
    closedAt: mapNullable(record, 'closedAt', stringField, toTimestamp),
    resultSummary: stringField(record, 'resultSummary'),
    createdBy: toIdentityId(stringField(record, 'createdBy')),
  }
}

export function encodeSprint(sprint: Sprint): JsonRecord {
  return { ...sprint }
}

function mapNullable<Raw, Value>(
  record: JsonRecord,
  field: string,
  read: (record: JsonRecord, field: string) => Raw,
  map: (value: Raw) => Value,
): Value | null {
  const value = nullableField(record, field, read)
  return value === null ? null : map(value)
}
