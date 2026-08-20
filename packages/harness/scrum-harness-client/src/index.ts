import { Service, type Context } from '@deepseek-ai/cordis'

/** Name the client service is registered under on the Cordis context. */
export const SCRUM_CLIENT_SERVICE = 'scrumClient'

/**
 * Browser-side entry point. It will own the Sidebar entry and the Scrum
 * application view; today it only proves that the plugin loads under the
 * dependencies it declares.
 */
export class ScrumClientService extends Service {
  constructor(ctx: Context) {
    super(ctx, SCRUM_CLIENT_SERVICE)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    scrumClient: ScrumClientService
  }
}

export const name = 'scrum-harness-client'

/**
 * The client contributes user interface through the host's slot registry, so
 * it stays pending until that service exists rather than registering into a
 * surface that is not there.
 */
export const inject: string[] = ['slots']

export function apply(ctx: Context): void {
  ctx.plugin(ScrumClientService)
}
