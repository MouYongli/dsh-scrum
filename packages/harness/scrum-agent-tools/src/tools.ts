import { defineTool, type JsonValue, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { toSprintId, toWorkItemId, toWorkItemStatus, type SprintId } from '@dsh-scrum/scrum-domain'
import type { ScrumAgentApi } from '@dsh-scrum/scrum-harness-host'
import { page, requireLimit, MAX_LIMIT } from './payload.js'
import {
  progressSummary,
  projectSummary,
  sprintSummary,
  workItemDetail,
  workItemSummary,
} from './summaries.js'

/**
 * The tool names, as the model sees them.
 *
 * Prefixed and snake_cased to match the Harness conventions, and published:
 * a name that changes is a name every saved conversation and every agent
 * preset naming it stops finding.
 */
export const READ_TOOL = {
  getProject: 'scrum_get_project',
  listBacklog: 'scrum_list_backlog',
  getSprint: 'scrum_get_sprint',
  getWorkItem: 'scrum_get_work_item',
} as const

export type ReadToolName = (typeof READ_TOOL)[keyof typeof READ_TOOL]

export const READ_TOOL_NAMES: readonly ReadToolName[] = Object.values(READ_TOOL)

/**
 * `backlog` names the items in no sprint at all, which is a filter value the
 * identifier grammar has no way to express. Spelling it out beats a magic
 * empty string the model would have to be told about in prose.
 */
const BACKLOG = 'backlog'

function toSprintFilter(value: string): SprintId | null {
  return value === BACKLOG ? null : toSprintId(value)
}

/**
 * Serializes a summary for the wire.
 *
 * The round trip is the boundary: everything above is built from readonly
 * types the JSON value type does not structurally accept, and passing it
 * through is what normalizes it rather than asserting it is already right.
 * The payloads are bounded, so the cost is not one worth avoiding.
 */
function asJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

/** One text block holding the result, which is what the model reads. */
function asText(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
}

const LIMIT_PARAMETER = {
  type: 'integer' as const,
  description: `How many items to return, at most ${MAX_LIMIT}.`,
}

/**
 * Builds the read-only tools against one session's view of the host.
 *
 * Every call goes through that view, so the acting identity is the one the
 * host resolved and a tool has no way to name another. There is no parameter
 * for who is asking, which is what makes an elevated or anonymous principal
 * unrepresentable rather than merely refused.
 */
export function createReadTools(api: ScrumAgentApi): readonly ToolDefinition[] {
  return [
    defineTool({
      name: READ_TOOL.getProject,
      description:
        'Read the Scrum project bound to this workspace: its key, name, status and workflow.',
      parameters: {},
      output: {
        schema: { type: 'json' },
        render: (_args, value) => asText(value),
      },
      isConcurrencySafe: () => true,
      execute: async () => {
        const { project, config } = await api.project()
        return asJson(projectSummary(project, config))
      },
    }),

    defineTool({
      name: READ_TOOL.listBacklog,
      description:
        'List work items, newest ordering first by backlog rank. Narrow with status or sprint; the result says how many items exist in total.',
      parameters: {
        limit: LIMIT_PARAMETER,
        status: {
          type: 'string',
          description: 'Return only items in this workflow status.',
        },
        sprintId: {
          type: 'string',
          description:
            'Return only items in this sprint. Pass "backlog" for the items in no sprint at all.',
        },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => asText(value),
      },
      isConcurrencySafe: () => true,
      execute: async (args) => {
        const limit = requireLimit(args.limit)
        const items = await api.backlog({
          ...(args.status === undefined ? {} : { statuses: [toWorkItemStatus(args.status)] }),
          ...(args.sprintId === undefined ? {} : { sprintId: toSprintFilter(args.sprintId) }),
        })
        return asJson(page(items.map(workItemSummary), limit))
      },
    }),

    defineTool({
      name: READ_TOOL.getSprint,
      description:
        'Read one sprint and its progress, or list the sprints when no identifier is given.',
      parameters: {
        sprintId: {
          type: 'string',
          description: 'The sprint to read, such as "sprint-3". Omit to list every sprint.',
        },
        limit: LIMIT_PARAMETER,
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => asText(value),
      },
      isConcurrencySafe: () => true,
      execute: async (args) => {
        if (args.sprintId === undefined) {
          const sprints = await api.sprints()
          return asJson(page(sprints.map(sprintSummary), requireLimit(args.limit)))
        }
        const id = toSprintId(args.sprintId)
        return asJson({
          sprint: sprintSummary(await api.sprint(id)),
          progress: progressSummary(await api.progress(id)),
        })
      },
    }),

    defineTool({
      name: READ_TOOL.getWorkItem,
      description:
        'Read one work item in full, including its description, acceptance criteria, parent and dependencies.',
      parameters: {
        workItemId: {
          type: 'string',
          description: 'The work item to read, such as "SCR-12".',
          required: true,
        },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => asText(value),
      },
      isConcurrencySafe: () => true,
      execute: async (args) =>
        asJson(workItemDetail(await api.workItem(toWorkItemId(args.workItemId)))),
    }),
  ]
}
