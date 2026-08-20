import { Service, type Context } from '@deepseek-ai/cordis'

/** Name the host service is registered under on the Cordis context. */
export const SCRUM_HOST_SERVICE = 'scrumHost'

/**
 * Host-side entry point for everything the Scrum plugin does outside the
 * browser. At this stage it carries no Scrum behaviour: it exists so that
 * loading and unloading the plugin has an observable effect.
 */
export class ScrumHostService extends Service {
  constructor(ctx: Context) {
    super(ctx, SCRUM_HOST_SERVICE)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    scrumHost: ScrumHostService
  }
}

export const name = 'scrum-harness-host'

/**
 * No host service is required yet. Workspace and session dependencies are
 * declared here once the plugin actually reads them, so that a missing
 * dependency keeps the plugin pending instead of failing halfway through.
 */
export const inject: string[] = []

export function apply(ctx: Context): void {
  ctx.plugin(ScrumHostService)
}
