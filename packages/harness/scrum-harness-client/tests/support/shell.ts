/**
 * A shell the plugin can register into.
 *
 * The real one declares its slots from two host plugins and feeds the entry
 * its services through the Cordis context. Nothing here models that: the tests
 * want the two components the plugin registers, and a way to say what the
 * shell's session list is currently answering.
 */
import type { ComponentType } from 'react'
import * as clientEntry from '@dsh-scrum/scrum-harness-client/client'

export interface SessionListSnapshot {
  readonly current?: string | undefined
  readonly phase?: string | undefined
}

export interface WorkspaceListSnapshot {
  readonly items: readonly {
    readonly workspaceId: string
    readonly sessionIds: readonly string[]
    readonly title?: string | undefined
    readonly path?: string | undefined
  }[]
  readonly recentWorkspaceId?: string | undefined
}

/** The `sessions.list` face the plugin reads, driven by hand. */
export interface SessionsStub {
  readonly list: {
    getSnapshot: () => SessionListSnapshot
    subscribe: (listener: () => void) => () => void
  }
  /** Publishes a new snapshot and tells whoever is listening. */
  readonly publish: (next: SessionListSnapshot) => void
  readonly listeners: () => number
}

export function sessionsStub(initial: SessionListSnapshot = { phase: 'ready' }): SessionsStub {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    publish: (next) => {
      snapshot = next
      for (const listener of [...listeners]) {
        listener()
      }
    },
    listeners: () => listeners.size,
  }
}

/** The `workspaces.list` face, driven the same way. */
export interface WorkspacesStub {
  readonly list: {
    getSnapshot: () => WorkspaceListSnapshot
    subscribe: (listener: () => void) => () => void
  }
  readonly publish: (next: WorkspaceListSnapshot) => void
  readonly startSession: (workspaceId?: string) => void
  readonly started: () => readonly (string | undefined)[]
}

export function workspacesStub(initial: WorkspaceListSnapshot = { items: [] }): WorkspacesStub {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const starts: (string | undefined)[] = []
  return {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    publish: (next) => {
      snapshot = next
      for (const listener of [...listeners]) {
        listener()
      }
    },
    startSession: (workspaceId) => {
      starts.push(workspaceId)
    },
    started: () => starts,
  }
}

export type Registrations = Map<string, ComponentType<Record<string, unknown>>>

/**
 * Applies the plugin against a registry that declares both slots at once, and
 * hands back what it registered.
 *
 * @param config - what the composing edition would supply.
 * @param services - the shell services the entry reads off its context.
 */
export function registrations(
  config: Record<string, unknown> = {},
  services: Record<string, unknown> = {},
): Registrations {
  const found: Registrations = new Map()
  const ctx = {
    ...services,
    slots: {
      inject: (_name: string, callback: () => void) => callback(),
      register: (spec: { name: string }, component: ComponentType<Record<string, unknown>>) => {
        found.set(spec.name, component)
        return () => undefined
      },
    },
  }
  clientEntry.apply(ctx as never, config as never)
  return found
}
