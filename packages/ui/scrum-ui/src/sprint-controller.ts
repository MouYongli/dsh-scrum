import {
  SPRINT_STATUS,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
  type WorkItemStatus,
} from '@dsh-scrum/scrum-domain'
import { boardView, type BoardView } from './board.js'
import type {
  BlockWorkItem,
  DependWorkItem,
  EditWorkItem,
  NewSprint,
  ParentWorkItem,
  ScrumClient,
  SetCriterion,
  WorkItemRef,
} from './client.js'
import { toFailure, type ScrumFailure } from './failure.js'

export interface SprintState {
  readonly phase: 'loading' | 'ready' | 'failed'
  readonly sprints: readonly Sprint[]
  readonly selected: Sprint | null
  readonly board: BoardView
  /** The product backlog, for planning work into the selected sprint. */
  readonly unplanned: readonly WorkItem[]
  /** The item the drawer is open on, resolved from what the board holds. */
  readonly detail: WorkItem | null
  readonly failure: ScrumFailure | null
  readonly busy: boolean
}

export interface SprintController {
  readonly state: () => SprintState
  readonly subscribe: (listener: () => void) => () => void
  readonly load: () => Promise<void>
  readonly select: (sprintId: SprintId) => Promise<void>
  readonly openDetail: (id: WorkItemId | null) => void
  readonly dismiss: () => void
  readonly create: (input: NewSprint) => Promise<void>
  readonly plan: (items: readonly WorkItemRef[], into: SprintId | null) => Promise<void>
  readonly move: (item: WorkItemRef, status: WorkItemStatus) => Promise<void>
  readonly edit: (command: EditWorkItem) => Promise<void>
  readonly setCriterion: (command: SetCriterion) => Promise<void>
  readonly setParent: (command: ParentWorkItem) => Promise<void>
  readonly setDependency: (command: DependWorkItem) => Promise<void>
  readonly block: (command: BlockWorkItem) => Promise<void>
}

const EMPTY_BOARD: BoardView = boardView([])

/**
 * Which sprint the screen opens on.
 *
 * The active one, because that is the one being worked and the one a board is
 * for. Failing that the next planned sprint, which is what planning is aimed
 * at. A closed sprint is never chosen: it is a record, and opening on a record
 * would suggest there is something to do there.
 */
export function defaultSprint(sprints: readonly Sprint[]): Sprint | null {
  return (
    sprints.find((sprint) => sprint.status === SPRINT_STATUS.active) ??
    sprints.find((sprint) => sprint.status === SPRINT_STATUS.planned) ??
    sprints[0] ??
    null
  )
}

export function createSprintController(client: ScrumClient): SprintController {
  let planned: readonly WorkItem[] = []
  let selectedId: SprintId | null = null
  let detailId: WorkItemId | null = null
  let state: SprintState = {
    phase: 'loading',
    sprints: [],
    selected: null,
    board: EMPTY_BOARD,
    unplanned: [],
    detail: null,
    failure: null,
    busy: false,
  }
  const listeners = new Set<() => void>()

  function set(next: SprintState): void {
    state = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  function reproject(patch: Partial<SprintState> = {}): void {
    const sprints = patch.sprints ?? state.sprints
    set({
      ...state,
      ...patch,
      sprints,
      selected: sprints.find((sprint) => sprint.id === selectedId) ?? null,
      board: boardView(planned),
      detail: planned.find((item) => item.id === detailId) ?? null,
    })
  }

  /**
   * Reads the sprint's work and the product backlog beside it.
   *
   * Both, on every read: planning moves an item from one list to the other, so
   * refreshing only the list that was written to would leave the other showing
   * the item it no longer holds.
   */
  async function readItems(): Promise<void> {
    planned = selectedId === null ? [] : await client.backlog({ sprintId: selectedId })
    reproject({ unplanned: await client.backlog({ sprintId: null }) })
  }

  async function load(): Promise<void> {
    try {
      const sprints = await client.sprints()
      selectedId =
        sprints.find((sprint) => sprint.id === selectedId)?.id ?? defaultSprint(sprints)?.id ?? null
      reproject({ phase: 'ready', sprints })
      await readItems()
    } catch (error: unknown) {
      planned = []
      reproject({ phase: 'failed', failure: toFailure(error), busy: false })
    }
  }

  /**
   * Runs one write and reads everything back, for the reason the backlog
   * controller gives: a board assembled from one response is a second answer
   * that can disagree with the store, and moving a card changes more than the
   * card that moved.
   */
  async function write(run: () => Promise<unknown>): Promise<void> {
    set({ ...state, busy: true, failure: null })
    try {
      await run()
      await load()
      set({ ...state, busy: false })
    } catch (error: unknown) {
      set({ ...state, busy: false, failure: toFailure(error) })
    }
  }

  return {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load,
    select: async (sprintId: SprintId) => {
      selectedId = sprintId
      detailId = null
      reproject()
      await readItems()
    },
    openDetail: (id: WorkItemId | null) => {
      detailId = id
      reproject()
    },
    dismiss: () => {
      set({ ...state, failure: null })
    },
    create: async (input: NewSprint) => {
      await write(async () => {
        const created = await client.createSprint(input)
        selectedId = created.id
      })
    },
    plan: async (items: readonly WorkItemRef[], into: SprintId | null) => {
      await write(async () => await client.planSprint({ sprintId: into, items }))
    },
    move: async (item: WorkItemRef, status: WorkItemStatus) => {
      await write(async () => await client.moveWorkItemStatus({ ...item, status }))
    },
    edit: async (command: EditWorkItem) => {
      await write(async () => await client.updateWorkItem(command))
    },
    setCriterion: async (command: SetCriterion) => {
      await write(async () => await client.setAcceptanceCriterion(command))
    },
    setParent: async (command: ParentWorkItem) => {
      await write(async () => await client.setWorkItemParent(command))
    },
    setDependency: async (command: DependWorkItem) => {
      await write(async () => await client.setWorkItemDependency(command))
    },
    block: async (command: BlockWorkItem) => {
      await write(async () => await client.blockWorkItem(command))
    },
  }
}
