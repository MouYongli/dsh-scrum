import { Service, type Context } from '@deepseek-ai/cordis'
import { ACCESS_MODE, type AccessMode } from '@dsh-scrum/scrum-application'
import type { ScrumAgentApi } from '@dsh-scrum/scrum-harness-host'
import { READ_TOOL_NAMES, createReadTools, type ReadToolName } from './tools.js'
import { WRITE_TOOL_NAMES, createWriteTools, type WriteToolName } from './write-tools.js'

/** Name the tools service is registered under on the Cordis context. */
export const SCRUM_TOOLS_SERVICE = 'scrumTools'

/**
 * What a session may see.
 *
 * An `off` session sees nothing rather than seeing tools that refuse. A model
 * shown a tool it may not use will try it, be told no, and try again in
 * another shape; a model not shown it never spends a turn on it. This is also
 * the difference between the user's Scrum switch being off and the plugin
 * looking broken.
 */
export function visibleTools(mode: AccessMode): readonly (ReadToolName | WriteToolName)[] {
  if (mode === ACCESS_MODE.off) {
    return []
  }
  return mode === ACCESS_MODE.write ? [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES] : READ_TOOL_NAMES
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

/** A registration that can be taken back when the session's access changes. */
export interface ScrumToolRegistration {
  readonly names: readonly string[]
  dispose(): void
}

/**
 * Registers the tools one session may currently use.
 *
 * The mode is read once, here, and the registration is disposed and rebuilt
 * when it changes. Registering everything and refusing inside each tool would
 * be simpler and wrong: the model would see a capability it does not have,
 * and the tool descriptions themselves leak what the session was not given.
 */
export function registerScrumTools(
  registry: ToolRegistry,
  api: ScrumAgentApi,
  mode: AccessMode,
): ScrumToolRegistration {
  const visible = new Set<string>(visibleTools(mode))
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
 * Host-side service that keeps one session's tools in step with its access.
 *
 * It holds no permission logic of its own. What a session may do is the host's
 * answer, asked again on every change; this only decides what is visible.
 */
export class ScrumToolsService extends Service {
  private registrations = new Map<string, ScrumToolRegistration>()

  constructor(ctx: Context) {
    super(ctx, SCRUM_TOOLS_SERVICE)
  }

  /** Brings one session's registration in line with its current access mode. */
  sync(
    sessionId: string,
    registry: ToolRegistry,
    api: ScrumAgentApi,
    mode: AccessMode,
  ): readonly string[] {
    this.registrations.get(sessionId)?.dispose()
    const registration = registerScrumTools(registry, api, mode)
    if (registration.names.length === 0) {
      this.registrations.delete(sessionId)
      return []
    }
    this.registrations.set(sessionId, registration)
    return registration.names
  }

  /** Names a session currently sees, which is what a test and a UI both ask. */
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
