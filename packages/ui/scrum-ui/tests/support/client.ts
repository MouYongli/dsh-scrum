import { disconnectedClient, type ScrumClient } from '@dsh-scrum/scrum-ui'

/**
 * A client that answers only what a test set up.
 *
 * Built over `disconnectedClient` so that a test which reaches a method it did
 * not stub fails with that method's name, instead of the type error that would
 * follow every new command onto every test file.
 */
export function stubClient(overrides: Partial<ScrumClient>): ScrumClient {
  return { ...disconnectedClient('the test did not stub this call'), ...overrides }
}
