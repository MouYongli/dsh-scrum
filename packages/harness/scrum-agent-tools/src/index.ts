import { Service, type Context } from '@deepseek-ai/cordis'
import { registerScrumConfirmation } from './confirmation.js'
import { PERMISSION, type Permission } from '@dsh-scrum/scrum-domain'
import type { ScrumAgentApi } from '@dsh-scrum/scrum-harness-host'
import { READ_TOOL_NAMES, createReadTools, type ReadToolName } from './tools.js'
import { WRITE_TOOL_NAMES, createWriteTools, type WriteToolName } from './write-tools.js'

/** Name the tools service is registered under on the Cordis context. */
export const SCRUM_TOOLS_SERVICE = 'scrumTools'

/**
 * What the current user's effective project permissions allow a model to see.
 * A model not shown a forbidden tool never spends a turn trying it.
 */
const REQUIRED_PERMISSION: Readonly<Record<ReadToolName | WriteToolName, Permission>> = {
  scrum_get_project: PERMISSION.projectView,
  scrum_list_backlog: PERMISSION.backlogView,
  scrum_get_sprint: PERMISSION.projectView,
  scrum_get_work_item: PERMISSION.backlogView,
  scrum_create_work_item: PERMISSION.workItemWrite,
  scrum_update_work_item: PERMISSION.workItemWrite,
  scrum_move_work_item: PERMISSION.workItemUpdateOwnStatus,
  scrum_block_work_item: PERMISSION.workItemSetBlocked,
  scrum_create_sprint: PERMISSION.sprintCreate,
  scrum_start_sprint: PERMISSION.sprintTransition,
  scrum_close_sprint: PERMISSION.sprintTransition,
  scrum_delete_work_item: PERMISSION.workItemWrite,
  scrum_change_project_settings: PERMISSION.projectConfigure,
}

export function visibleTools(
  permissions: ReadonlySet<Permission>,
): readonly (ReadToolName | WriteToolName)[] {
  return [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES].filter((name) =>
    permissions.has(REQUIRED_PERMISSION[name]),
  )
}

/**
 * The part of the Harness tool registry this plugin needs.
 *
 * Narrowed to a port so the registration rules can be tested without a running
 * Harness, and satisfied structurally by `ctx.tools`.
 */
export interface ToolRegistry {
  register(definition: { readonly name: string }): () => void
}

/** A registration that can be taken back when effective permissions change. */
export interface ScrumToolRegistration {
  readonly names: readonly string[]
  dispose(): void
}

/**
 * Registers the tools the current user may use in this workspace.
 *
 * The mode is read once, here, and the registration is disposed and rebuilt
 * when it changes. Registering everything and refusing inside each tool would
 * be simpler and wrong: the model would see a capability it does not have,
 * and the tool descriptions themselves leak capabilities the user was not given.
 */
export function registerScrumTools(
  registry: ToolRegistry,
  api: ScrumAgentApi,
  permissions: ReadonlySet<Permission>,
): ScrumToolRegistration {
  const visible = new Set<string>(visibleTools(permissions))
  const disposers = [...createReadTools(api), ...createWriteTools(api)]
    .filter((definition) => visible.has(definition.name))
    .map((definition) => ({ name: definition.name, dispose: registry.register(definition) }))
  return {
    names: disposers.map((registered) => registered.name),
    dispose: () => {
      for (const registered of disposers) {
        registered.dispose()
      }
    },
  }
}

/**
 * Host-side service that keeps each agent scope's tools in step with project access.
 *
 * It holds no permission logic of its own; it only projects a resolved
 * permission set into tool visibility.
 */
export class ScrumToolsService extends Service {
  private registrations = new Map<string, ScrumToolRegistration>()

  constructor(ctx: Context) {
    super(ctx, SCRUM_TOOLS_SERVICE)
  }

  /** Brings one agent scope's registration in line with current permissions. */
  sync(
    sessionId: string,
    registry: ToolRegistry,
    api: ScrumAgentApi,
    permissions: ReadonlySet<Permission>,
  ): readonly string[] {
    this.registrations.get(sessionId)?.dispose()
    const registration = registerScrumTools(registry, api, permissions)
    if (registration.names.length === 0) {
      this.registrations.delete(sessionId)
      return []
    }
    this.registrations.set(sessionId, registration)
    return registration.names
  }

  /** Names the tools one agent scope currently sees. */
  visible(sessionId: string): readonly string[] {
    return this.registrations.get(sessionId)?.names ?? []
  }

  stop(): void {
    for (const registration of this.registrations.values()) {
      registration.dispose()
    }
    this.registrations = new Map()
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    scrumTools: ScrumToolsService
  }
}

export const name = 'scrum-agent-tools'

/**
 * The registry has to exist before a tool can be registered into it, so the
 * plugin stays pending rather than registering into a surface that is not
 * there.
 */
export const inject: string[] = ['tools']

export function apply(ctx: Context): void {
  ctx.plugin(ScrumToolsService)
  registerScrumConfirmation(ctx)
}

export type { ReadToolName } from './tools.js'
export { READ_TOOL, READ_TOOL_NAMES, createReadTools } from './tools.js'
export type { WriteToolName } from './write-tools.js'
export {
  HIGH_IMPACT_TOOLS,
  WRITE_TOOL,
  WRITE_TOOL_NAMES,
  createWriteTools,
  isHighImpactTool,
} from './write-tools.js'
export type { ToolDecision } from './confirmation.js'
export { confirmationFor, registerScrumConfirmation } from './confirmation.js'
export type { WriteOutcome } from './conflict.js'
export { attemptWrite, conflictOutcome } from './conflict.js'
export type { Page } from './payload.js'
export { DEFAULT_LIMIT, MAX_LIMIT, page, requireLimit } from './payload.js'
export type {
  ProjectSummary,
  SprintProgressSummary,
  SprintSummary,
  WorkItemDetail,
  WorkItemSummary,
} from './summaries.js'
export {
  progressSummary,
  projectSummary,
  sprintSummary,
  workItemDetail,
  workItemSummary,
} from './summaries.js'
