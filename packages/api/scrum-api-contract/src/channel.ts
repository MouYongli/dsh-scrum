import {
  WORK_ITEM_TYPE,
  toBugSeverity,
  toIdentityId,
  toPriority,
  toProjectKey,
  toRank,
  toRevision,
  toSprintId,
  toTimestamp,
  toWorkItemCategory,
  toWorkItemId,
  toWorkItemResolution,
  toWorkItemStatus,
  toWorkItemType,
  type ScrumError,
} from '@dsh-scrum/scrum-domain'
import { z } from 'zod'

/**
 * The logical RPC channel the workbench talks to its host over.
 *
 * A channel of this plugin's own rather than an endpoint claimed on the
 * shell's shared `/api`: the Harness registry takes an absolute channel with
 * its own trust policy, so nothing here depends on the shape of somebody
 * else's namespace, and removing the plugin removes the whole channel.
 */
export const SCRUM_CHANNEL = '/scrum'

/**
 * The calls the browser half may make.
 *
 * One per method on the interface the screens are written against, and no
 * more. The host API is wider — it can detach a binding, delete a work item
 * and configure a project — and a call the interface never makes is a call the
 * browser must not be able to make either.
 */
export const SCRUM_ENDPOINT = {
  authorization: 'authorization',
  entry: 'entry',
  remoteProfiles: 'remote.profile.list',
  remoteBegin: 'remote.begin',
  remoteAttach: 'remote.attach',
  createProject: 'project.create',
  updateProject: 'project.update',
  backlog: 'backlog',
  createWorkItem: 'workItem.create',
  updateWorkItem: 'workItem.update',
  setAcceptanceCriterion: 'workItem.criterion',
  moveWorkItemToRank: 'workItem.rank',
  setWorkItemParent: 'workItem.parent',
  setWorkItemDependency: 'workItem.dependency',
  blockWorkItem: 'workItem.block',
  moveWorkItemStatus: 'workItem.status',
  resolveWorkItem: 'workItem.resolution',
  sprints: 'sprint.list',
  createSprint: 'sprint.create',
  planSprint: 'sprint.plan',
  startSprint: 'sprint.start',
  closeSprint: 'sprint.close',
  activity: 'activity.recent',
} as const

export type ScrumEndpoint = (typeof SCRUM_ENDPOINT)[keyof typeof SCRUM_ENDPOINT]

const ENDPOINTS: readonly string[] = Object.values(SCRUM_ENDPOINT)

/** Whether this channel owns the endpoint, for a dispatcher that sees strings. */
export function isScrumEndpoint(endpoint: string): endpoint is ScrumEndpoint {
  return ENDPOINTS.includes(endpoint)
}

/**
 * A domain converter as a schema.
 *
 * The vocabulary lives in `scrum-domain` and is read from there rather than
 * spelled again here. A second list of work item types on the wire would be a
 * list that can disagree with the one the rules are written against, and the
 * disagreement would show up as data the store accepted and the domain cannot
 * explain.
 */
function domain<Value>(convert: (raw: never) => Value, expected: string): z.ZodType<Value> {
  return z.unknown().transform((raw, context) => {
    try {
      return convert(raw as never)
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: (error as ScrumError).message ?? `expected ${expected}`,
      })
      return z.NEVER
    }
  })
}

const workItemId = domain(toWorkItemId, 'a work item id')
const sprintId = domain(toSprintId, 'a sprint id')
const revision = domain(toRevision, 'a revision')
const rank = domain(toRank, 'a rank')
const timestamp = domain(toTimestamp, 'a timestamp')
const priority = domain(toPriority, 'a priority')
const workItemType = domain(toWorkItemType, 'a work item type')
const workItemCategory = domain(toWorkItemCategory, 'a work category')
const bugSeverity = domain(toBugSeverity, 'a bug severity')
const workItemStatus = domain(toWorkItemStatus, 'a work item status')
const workItemResolution = domain(toWorkItemResolution, 'a work item resolution')
const projectKey = domain(toProjectKey, 'a project key')
const identityId = domain(toIdentityId, 'an identity id')

/**
 * Which workspace and session the caller is looking at.
 *
 * Sent on every call rather than held on the connection. The host serves every
 * session at once and holds no selection of its own — the selection is the
 * browser's — and a value cached on the connection would answer for the
 * workspace the user had open when the socket opened, not the one in front of
 * them. The host resolves both against its own registry, so this names a
 * subject and never grants one.
 */
export const scrumScopeSchema = z.object({
  workspaceId: z.string().trim().min(1).nullable(),
  sessionId: z.string().trim().min(1).nullable(),
})

export type ScrumScope = z.infer<typeof scrumScopeSchema>

const acceptanceCriterion = z.object({
  text: z.string(),
  satisfied: z.boolean(),
})

/**
 * The fields a type carries, one shape per type.
 *
 * Tagged with the type it describes, and strict about everything else. The tag
 * travels to the domain, which refuses details describing a type other than
 * the one they were handed with — an edit can leave the type alone, and only
 * the layer holding the stored item knows what that type is.
 *
 * Strict, because a key no shape owns can only come from a caller confusing
 * two types, and this is where it is still holding the field it meant.
 */
const typeDetails = z.discriminatedUnion('type', [
  z.object({ type: z.literal(WORK_ITEM_TYPE.epic), color: z.string().optional() }).strict(),
  z.object({ type: z.literal(WORK_ITEM_TYPE.story) }).strict(),
  z
    .object({
      type: z.literal(WORK_ITEM_TYPE.task),
      timebox: z.int().nullable().optional(),
      outcome: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal(WORK_ITEM_TYPE.bug),
      severity: bugSeverity.nullable().optional(),
      stepsToReproduce: z.string().optional(),
      expected: z.string().optional(),
      actual: z.string().optional(),
      environment: z.string().optional(),
      affectedVersion: z.string().optional(),
      isRegression: z.boolean().optional(),
      rootCause: z.string().optional(),
    })
    .strict(),
  z.object({ type: z.literal(WORK_ITEM_TYPE.subtask) }).strict(),
])

const workItemRef = {
  workItemId,
  expectedRevision: revision,
}

const sprintRef = {
  sprintId,
  expectedRevision: revision,
}

const detailChanges = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  type: workItemType.optional(),
  category: workItemCategory.nullable().optional(),
  typeDetails: typeDetails.optional(),
  priority: priority.optional(),
  assigneeId: identityId.nullable().optional(),
  estimate: z.number().nullable().optional(),
  labels: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(acceptanceCriterion).optional(),
})

const empty = z.object({})

/**
 * What each endpoint accepts.
 *
 * The browser is not a trusted caller even on loopback, and the domain does
 * not re-check every field it is handed: `createWorkItem` reads `type` and
 * `priority` straight onto the entity, so an unparsed payload could store a
 * work item of a type no rule knows. Parsing here is what makes the cast on
 * the other side of the wire true.
 */
export const SCRUM_INPUT = {
  [SCRUM_ENDPOINT.authorization]: empty,
  [SCRUM_ENDPOINT.entry]: empty,
  [SCRUM_ENDPOINT.remoteProfiles]: empty,
  [SCRUM_ENDPOINT.remoteBegin]: z.object({ connectionId: z.string().trim().min(1) }),
  [SCRUM_ENDPOINT.remoteAttach]: z.object({
    connectionId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
  }),
  [SCRUM_ENDPOINT.createProject]: z.object({
    key: projectKey,
    name: z.string(),
    description: z.string().optional(),
  }),
  [SCRUM_ENDPOINT.updateProject]: z.object({
    expectedRevision: revision,
    changes: z.object({ name: z.string().optional(), description: z.string().optional() }),
  }),
  [SCRUM_ENDPOINT.backlog]: z.object({
    text: z.string().optional(),
    types: z.array(workItemType).optional(),
    levels: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).optional(),
    categories: z.array(workItemCategory).optional(),
    resolutions: z.array(workItemResolution).optional(),
    statuses: z.array(workItemStatus).optional(),
    priorities: z.array(priority).optional(),
    // Three answers, like the sprint: somebody's work, unassigned (`null`),
    // and anybody's (absent).
    assigneeId: identityId.nullable().optional(),
    labels: z.array(z.string()).optional(),
    blocked: z.boolean().optional(),
    // Three answers, and the difference matters: a sprint's board, the product
    // backlog (`null`), and every item in the project (absent).
    sprintId: sprintId.nullable().optional(),
  }),
  [SCRUM_ENDPOINT.createWorkItem]: z.object({
    type: workItemType,
    title: z.string(),
    description: z.string().optional(),
    category: workItemCategory.nullable().optional(),
    typeDetails: typeDetails.optional(),
    parentId: workItemId.nullable().optional(),
    priority: priority.optional(),
    labels: z.array(z.string()).optional(),
    acceptanceCriteria: z.array(acceptanceCriterion).optional(),
  }),
  [SCRUM_ENDPOINT.updateWorkItem]: z.object({ ...workItemRef, changes: detailChanges }),
  [SCRUM_ENDPOINT.setAcceptanceCriterion]: z.object({
    ...workItemRef,
    index: z.int().nonnegative(),
    satisfied: z.boolean(),
  }),
  [SCRUM_ENDPOINT.moveWorkItemToRank]: z.object({
    ...workItemRef,
    after: rank.nullable(),
    before: rank.nullable(),
  }),
  [SCRUM_ENDPOINT.setWorkItemParent]: z.object({
    ...workItemRef,
    parentId: workItemId.nullable(),
  }),
  [SCRUM_ENDPOINT.setWorkItemDependency]: z.object({
    ...workItemRef,
    dependsOnId: workItemId,
    linked: z.boolean(),
  }),
  [SCRUM_ENDPOINT.blockWorkItem]: z.object({ ...workItemRef, reason: z.string().nullable() }),
  [SCRUM_ENDPOINT.moveWorkItemStatus]: z.object({
    ...workItemRef,
    status: workItemStatus,
    resolution: workItemResolution.optional(),
  }),
  [SCRUM_ENDPOINT.resolveWorkItem]: z.object({
    ...workItemRef,
    resolution: workItemResolution,
  }),
  [SCRUM_ENDPOINT.sprints]: empty,
  [SCRUM_ENDPOINT.createSprint]: z.object({
    name: z.string(),
    goal: z.string().optional(),
    startDate: timestamp,
    endDate: timestamp,
  }),
  [SCRUM_ENDPOINT.planSprint]: z.object({
    sprintId: sprintId.nullable(),
    items: z.array(z.object(workItemRef)),
  }),
  [SCRUM_ENDPOINT.startSprint]: z.object(sprintRef),
  [SCRUM_ENDPOINT.closeSprint]: z.object({
    ...sprintRef,
    resultSummary: z.string().optional(),
    dispositions: z.array(z.object({ ...workItemRef, moveTo: sprintId.nullable() })),
  }),
  // Bounded here rather than by the caller's good manners: a browser asking
  // for every record a three-year-old project holds would read every month
  // file to answer one panel.
  [SCRUM_ENDPOINT.activity]: z.object({
    limit: z.int().positive().max(200),
    since: timestamp.optional(),
  }),
} as const satisfies Record<ScrumEndpoint, z.ZodType>

/** The payload of one call, before the API envelope wraps it. */
export interface ScrumCall<Input = unknown> {
  readonly scope: ScrumScope
  readonly input: Input
}

/**
 * The call shell, parsed before the endpoint's own schema runs.
 *
 * Split in two so a caller that named a workspace nobody has heard of is
 * refused as such, rather than as a pile of field errors from reading its
 * payload with the wrong endpoint's schema.
 */
export const scrumCallSchema = z.object({
  scope: scrumScopeSchema,
  input: z.unknown(),
})

export type ScrumInput<Endpoint extends ScrumEndpoint> = z.infer<(typeof SCRUM_INPUT)[Endpoint]>
