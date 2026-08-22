import type { Context } from '@deepseek-ai/cordis'
import { isHighImpactTool } from './write-tools.js'

/**
 * The pre-dispatch decision the Harness registry understands.
 *
 * Repeated here rather than imported so this module can be exercised without a
 * running registry; the shape is the registry's, and the contract test pins it.
 */
export type ToolDecision = { kind: 'allow' } | { kind: 'ask'; reason: string }

const REASONS: Readonly<Record<string, string>> = {
  scrum_start_sprint: 'Opening a sprint changes what the whole team is working on.',
  scrum_close_sprint:
    'Closing a sprint finalises what it delivered and moves everything unfinished.',
  scrum_delete_work_item: 'Deleting a work item cannot be undone from this conversation.',
  scrum_change_project_settings:
    'Changing the project settings affects every sprint and every estimate after it.',
}

/**
 * Decides whether a call needs a person to agree first.
 *
 * `ask` is not advisory: a deployment with no approval service turns it into a
 * denial, which is the right way round. An agent that cannot reach a human
 * must not close somebody's sprint on the grounds that nobody was there to
 * object.
 */
export function confirmationFor(toolName: string): ToolDecision {
  if (!isHighImpactTool(toolName)) {
    return { kind: 'allow' }
  }
  return { kind: 'ask', reason: REASONS[toolName] ?? 'This changes shared project data.' }
}

/**
 * Puts the decision in front of every dispatch.
 *
 * Registered as a pre-execute gate rather than checked inside each tool. A
 * tool that asked for itself could be added without asking, and the one that
 * forgot would be the destructive one somebody added in a hurry.
 */
export function registerScrumConfirmation(ctx: Context): () => void {
  return ctx.on(
    'tools/pre-execute',
    async (execution: { readonly name: string }, next: () => Promise<ToolDecision>) => {
      const decision = confirmationFor(execution.name)
      return decision.kind === 'ask' ? decision : await next()
    },
  )
}
