/**
 * What the interface needs from whatever is behind it.
 *
 * Deliberately not the host's types: this package is edition-independent and
 * must not learn the shape of a workspace binding or a stored project. It
 * receives a view and sends a command, and a remote edition can satisfy the
 * same interface over the wire.
 */
export interface ProjectView {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly description: string
}

export interface WorkspaceView {
  readonly id: string
  readonly name: string
}

/** What the workbench found when it opened. Mirrors the host's entry states. */
export type EntryView =
  | { readonly state: 'no-workspace' }
  | { readonly state: 'unbound'; readonly workspace: WorkspaceView }
  | { readonly state: 'stale'; readonly workspace: WorkspaceView }
  | {
      readonly state: 'bound' | 'archived'
      readonly workspace: WorkspaceView
      readonly project: ProjectView
      readonly moved: boolean
    }

export interface CreateProjectInput {
  readonly key: string
  readonly name: string
  readonly description?: string | undefined
}

export interface ScrumClient {
  entry(): Promise<EntryView>
  createProject(input: CreateProjectInput): Promise<ProjectView>
}
