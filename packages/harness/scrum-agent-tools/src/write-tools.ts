import { defineTool, type JsonValue, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  toPriority,
  toRank,
  toRevision,
  toSprintId,
  toTimestamp,
  toWorkItemId,
  toWorkItemStatus,
  toWorkItemType,
  toEstimationMethod,
} from '@dsh-scrum/scrum-domain'
import type { ScrumAgentApi } from '@dsh-scrum/scrum-harness-host'
import { attemptWrite } from './conflict.js'
import { sprintSummary, workItemSummary } from './summaries.js'

/**
 * The writing tools, as the model sees them.
 *
 * Four of them change one thing a person could undo by hand; the rest are the
 * ones the product design calls high impact, and they are gated on an explicit
 * confirmation before they run.
 */
export const WRITE_TOOL = {
  createWorkItem: 'scrum_create_work_item',
  updateWorkItem: 'scrum_update_work_item',
  moveWorkItem: 'scrum_move_work_item',
  blockWorkItem: 'scrum_block_work_item',
  createSprint: 'scrum_create_sprint',
  startSprint: 'scrum_start_sprint',
  closeSprint: 'scrum_close_sprint',
  deleteWorkItem: 'scrum_delete_work_item',
  changeProjectSettings: 'scrum_change_project_settings',
} as const

export type WriteToolName = (typeof WRITE_TOOL)[keyof typeof WRITE_TOOL]

export const WRITE_TOOL_NAMES: readonly WriteToolName[] = Object.values(WRITE_TOOL)

/**
 * The ones that need a person to agree first.
 *
 * Starting and closing a sprint move a team's shared record of what it is
 * doing; deleting an item and rewriting the project's settings are not
 * recoverable from the conversation. Everything else an agent writes is an
 * ordinary edit somebody can see and reverse.
 */
export const HIGH_IMPACT_TOOLS: readonly WriteToolName[] = [
  WRITE_TOOL.startSprint,
  WRITE_TOOL.closeSprint,
  WRITE_TOOL.deleteWorkItem,
  WRITE_TOOL.changeProjectSettings,
]

export function isHighImpactTool(name: string): boolean {
  return (HIGH_IMPACT_TOOLS as readonly string[]).includes(name)
}

function asText(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
}

function asJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

const OUTPUT = {
  schema: { type: 'json' as const },
  render: (_args: unknown, value: unknown) => asText(value),
}

const REVISION = {
  type: 'integer' as const,
  description: 'The revision you last read. The call is refused if it has moved on since.',
  required: true as const,
}

const WORK_ITEM_ID = {
  type: 'string' as const,
  description: 'The work item, such as "SCR-12".',
  required: true as const,
}

/**
 * Builds the writing tools against one session's view of the host.
 *
 * Nothing here decides what is allowed. The host answers that on every call,
 * so an argument the model crafts cannot reach past it — there is no project
 * parameter, no identity parameter, and no way to name a workspace other than
 * the one that is open.
 */
export function createWriteTools(api: ScrumAgentApi): readonly ToolDefinition[] {
  return [
    defineTool({
      name: WRITE_TOOL.createWorkItem,
      description: 'Add a work item to the backlog of the project bound to this workspace.',
      parameters: {
        type: {
          type: 'string',
          description: 'One of epic, story, task or bug.',
          required: true,
        },
        title: { type: 'string', description: 'A short title.', required: true },
        description: { type: 'string', description: 'The body of the item.' },
        priority: { type: 'string', description: 'One of lowest, low, medium, high or highest.' },
      },
      output: OUTPUT,
      execute: async (args) =>
        asJson(
          await attemptWrite(async () =>
            asJson(
              workItemSummary(
                await api.createWorkItem({
                  type: toWorkItemType(args.type),
                  title: args.title,
                  ...(args.description === undefined ? {} : { description: args.description }),
                  ...(args.priority === undefined ? {} : { priority: toPriority(args.priority) }),
                }),
              ),
            ),
          ),
        ),
    }),

    defineTool({
      name: WRITE_TOOL.updateWorkItem,
      description:
        'Change the title, description, priority or estimate of one work item. Status, sprint and blocking have their own tools.',
      parameters: {
        workItemId: WORK_ITEM_ID,
        expectedRevision: REVISION,
        title: { type: 'string', description: 'A new title.' },
        description: { type: 'string', description: 'A new body.' },
        priority: { type: 'string', description: 'One of lowest, low, medium, high or highest.' },
        estimate: { type: 'number', description: 'The estimate, or null to clear it.' },
      },
      output: OUTPUT,
      execute: async (args) =>
        asJson(
          await attemptWrite(async () =>
            asJson(
              workItemSummary(
                await api.updateWorkItem({
                  workItemId: toWorkItemId(args.workItemId),
                  expectedRevision: toRevision(args.expectedRevision),
                  changes: {
                    ...(args.title === undefined ? {} : { title: args.title }),
                    ...(args.description === undefined ? {} : { description: args.description }),
                    ...(args.priority === undefined ? {} : { priority: toPriority(args.priority) }),
                    ...(args.estimate === undefined ? {} : { estimate: args.estimate }),
                  },
                }),
              ),
            ),
          ),
        ),
    }),

    defineTool({
      name: WRITE_TOOL.moveWorkItem,
      description:
        'Move one work item: to another board column, into or out of a sprint, or to another place in the backlog.',
      parameters: {
        workItemId: WORK_ITEM_ID,
        expectedRevision: REVISION,
        status: { type: 'string', description: 'The board column to move the card to.' },
        sprintId: {
          type: 'string',
          description: 'The sprint to plan it into, or "backlog" to take it out of one.',
        },
        afterRank: { type: 'string', description: 'The rank of the item it should follow.' },
        beforeRank: { type: 'string', description: 'The rank of the item it should precede.' },
      },
      output: OUTPUT,
      execute: async (args) =>
        asJson(
          await attemptWrite(async () => {
            const workItemId = toWorkItemId(args.workItemId)
            const expectedRevision = toRevision(args.expectedRevision)
            if (args.sprintId !== undefined) {
              const [planned] = await api.planSprint({
                sprintId: args.sprintId === 'backlog' ? null : toSprintId(args.sprintId),
                items: [{ workItemId, expectedRevision }],
              })
              return asJson(workItemSummary(planned!))
            }
            if (args.status !== undefined) {
              return asJson(
                workItemSummary(
                  await api.moveWorkItemStatus({
                    workItemId,
                    expectedRevision,
                    status: toWorkItemStatus(args.status),
                  }),
                ),
              )
            }
            return asJson(
              workItemSummary(
                await api.moveWorkItemToRank({
                  workItemId,
                  expectedRevision,
                  after: args.afterRank === undefined ? null : toRank(args.afterRank),
                  before: args.beforeRank === undefined ? null : toRank(args.beforeRank),
                }),
              ),
            )
          }),
        ),
    }),

    defineTool({
      name: WRITE_TOOL.blockWorkItem,
      description: 'Mark a work item blocked with a reason, or clear the block.',
      parameters: {
        workItemId: WORK_ITEM_ID,
        expectedRevision: REVISION,
        reason: {
          type: 'string',
          description: 'Why it is blocked. Omit to clear an existing block.',
        },
      },
      output: OUTPUT,
      execute: async (args) =>
        asJson(
          await attemptWrite(async () =>
            asJson(
              workItemSummary(
                await api.blockWorkItem({
                  workItemId: toWorkItemId(args.workItemId),
                  expectedRevision: toRevision(args.expectedRevision),
                  reason: args.reason ?? null,
                }),
              ),
            ),
          ),
        ),
    }),

    defineTool({
      name: WRITE_TOOL.createSprint,
      description:
        'Plan a new sprint. It starts closed to work until somebody opens it with scrum_start_sprint.',
      parameters: {
        name: { type: 'string', description: 'What the sprint is called.', required: true },
        goal: { type: 'string', description: 'What it sets out to deliver.' },
        startDate: {
          type: 'string',
          description: 'When it is meant to start, as a UTC instant.',
          required: true,
        },
        endDate: {
          type: 'string',
          description: 'When it is meant to end, as a UTC instant.',
          required: true,
        },
      },
      output: OUTPUT,
      execute: async (args) =>
        asJson(
          await attemptWrite(async () =>
            asJson(
              sprintSummary(
                await api.createSprint({
                  name: args.name,
                  ...(args.goal === undefined ? {} : { goal: args.goal }),
                  startDate: toTimestamp(args.startDate),
                  endDate: toTimestamp(args.endDate),
                }),
              ),
            ),
          ),
        ),
    }),

    defineTool({
      name: WRITE_TOOL.startSprint,
      description: 'Open a planned sprint. The project may have only one open sprint at a time.',
      parameters: {
        sprintId: { type: 'string', description: 'The sprint to open.', required: true },
        expectedRevision: REVISION,
      },
      output: OUTPUT,
      execute: async (args) =>
        asJson(
          await attemptWrite(async () =>
            asJson(
              sprintSummary(
                await api.startSprint({
                  sprintId: toSprintId(args.sprintId),
                  expectedRevision: toRevision(args.expectedRevision),
                }),
              ),
            ),
          ),
        ),
    }),

    defineTool({
      name: WRITE_TOOL.closeSprint,
      description:
        'Close an open sprint. Every unfinished item needs a disposition: back to the backlog, or into a named sprint.',
      parameters: {
        sprintId: { type: 'string', description: 'The sprint to close.', required: true },
        expectedRevision: REVISION,
        resultSummary: { type: 'string', description: 'What the sprint delivered.' },
        dispositions: {
          type: 'array',
          description:
            'One entry per unfinished item: workItemId, expectedRevision, and moveTo (a sprint id, or "backlog").',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              workItemId: { type: 'string', required: true },
              expectedRevision: { type: 'integer', required: true },
              moveTo: { type: 'string', required: true },
            },
          },
          required: true,
        },
      },
      output: OUTPUT,
      execute: async (args) =>
        asJson(
          await attemptWrite(async () =>
            asJson(
              sprintSummary(
                await api.closeSprint({
                  sprintId: toSprintId(args.sprintId),
                  expectedRevision: toRevision(args.expectedRevision),
                  ...(args.resultSummary === undefined
                    ? {}
                    : { resultSummary: args.resultSummary }),
                  dispositions: args.dispositions.map((disposition) => ({
                    workItemId: toWorkItemId(disposition.workItemId),
                    expectedRevision: toRevision(disposition.expectedRevision),
                    moveTo:
                      disposition.moveTo === 'backlog' ? null : toSprintId(disposition.moveTo),
                  })),
                }),
              ),
            ),
          ),
        ),
    }),

    defineTool({
      name: WRITE_TOOL.deleteWorkItem,
      description:
        'Delete a work item. Refused while anything still points at it, and the refusal says what does.',
      parameters: { workItemId: WORK_ITEM_ID, expectedRevision: REVISION },
      output: OUTPUT,
      execute: async (args) =>
        asJson(
          await attemptWrite(async () =>
            asJson(
              await api.deleteWorkItem({
                workItemId: toWorkItemId(args.workItemId),
                expectedRevision: toRevision(args.expectedRevision),
              }),
            ),
          ),
        ),
    }),

    defineTool({
      name: WRITE_TOOL.changeProjectSettings,
      description:
        'Change the project settings: sprint length, estimation method, definition of done or work in progress limit.',
      parameters: {
        expectedRevision: REVISION,
        sprintLengthInDays: { type: 'integer', description: 'How many days a sprint runs.' },
        estimationMethod: {
          type: 'string',
          description: 'One of story_points, hours or count.',
        },
        definitionOfDone: {
          type: 'array',
          description: 'The conditions every item must meet.',
          items: { type: 'string' },
        },
      },
      output: OUTPUT,
      execute: async (args) =>
        asJson(
          await attemptWrite(async () => {
            const stored = await api.configureProject({
              expectedRevision: toRevision(args.expectedRevision),
              changes: {
                ...(args.sprintLengthInDays === undefined
                  ? {}
                  : { sprintLengthInDays: args.sprintLengthInDays }),
                ...(args.estimationMethod === undefined
                  ? {}
                  : { estimationMethod: toEstimationMethod(args.estimationMethod) }),
                ...(args.definitionOfDone === undefined
                  ? {}
                  : { definitionOfDone: args.definitionOfDone }),
              },
            })
            return asJson({
              sprintLengthInDays: stored.config.sprintLengthInDays,
              estimationMethod: stored.config.estimationMethod,
              definitionOfDone: [...stored.config.definitionOfDone],
              revision: stored.config.revision,
            })
          }),
        ),
    }),
  ]
}
