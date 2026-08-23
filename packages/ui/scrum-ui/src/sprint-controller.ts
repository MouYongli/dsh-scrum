import {
  SPRINT_STATUS,
  isWorkItemFinished,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
  type WorkItemResolution,
  type WorkItemStatus,
} from '@dsh-scrum/scrum-domain'
import { BOARD_LANE, boardView, type BoardLane, type BoardView } from './board.js'
import type {
  BlockWorkItem,
  DependWorkItem,
  Disposition,
  EditWorkItem,
  NewSprint,
  ParentWorkItem,
  ScrumClient,
  SetCriterion,
  WorkItemRef,
} from './client.js'
import { toFailure, type ScrumFailure } from './failure.js'

/**
 * What the user is being asked to confirm.
 *
 * Starting and closing are the two acts that change what everybody else's
 * board says, and neither is undone by clicking again. Closing carries the
 * items standing in its way, because the decision the user has to make is
 * about them and not about the sprint.
 */
export type SprintConfirmation =
  | { readonly kind: 'start'; readonly sprint: Sprint }
  | { readonly kind: 'close'; readonly sprint: Sprint; readonly unfinished: readonly WorkItem[] }

export interface SprintState {
  readonly phase: 'loading' | 'ready' | 'failed'
  readonly sprints: readonly Sprint[]
  readonly selected: Sprint | null
  readonly board: BoardView
  /** The product backlog, for planning work into the selected sprint. */
  readonly unplanned: readonly WorkItem[]
  /** The item the drawer is open on, resolved from what the board holds. */
  readonly detail: WorkItem | null
  readonly confirmation: SprintConfirmation | null
  /** How the board is split into rows. A view choice, kept out of the query. */
  readonly lane: BoardLane
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
  readonly setLane: (lane: BoardLane) => void
  readonly create: (input: NewSprint) => Promise<void>
  readonly plan: (items: readonly WorkItemRef[], into: SprintId | null) => Promise<void>
  readonly move: (
    item: WorkItemRef,
    status: WorkItemStatus,
    /** Absent leaves it to the domain, which reads an unnamed outcome as done. */
    resolution?: WorkItemResolution | null,
  ) => Promise<void>
  readonly edit: (command: EditWorkItem) => Promise<void>
  readonly setCriterion: (command: SetCriterion) => Promise<void>
  readonly setParent: (command: ParentWorkItem) => Promise<void>
  readonly setDependency: (command: DependWorkItem) => Promise<void>
  readonly block: (command: BlockWorkItem) => Promise<void>
  readonly ask: (kind: 'start' | 'close') => void
  readonly cancel: () => void
  readonly start: () => Promise<void>
  readonly close: (resultSummary: string, dispositions: readonly Disposition[]) => Promise<void>
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
  // Read once and kept: a limit is a project setting rather than something a
  // sprint carries, and refetching it on every board refresh would ask the
  // host the same question all day.
  let limit: number | null = null
  let epicTitles = new Map<string, string>()
  let state: SprintState = {
    phase: 'loading',
    sprints: [],
    selected: null,
    board: EMPTY_BOARD,
    unplanned: [],
    detail: null,
    confirmation: null,
    lane: BOARD_LANE.none,
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
      board: boardView(planned, {
        limit,
        lane: patch.lane ?? state.lane,
        epicTitles,
      }),
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
    const unplanned = await client.backlog({ sprintId: null })
    // Titles for the epic lanes come from everything that was read: a lane
    // headed by an identifier is a lane nobody can read at a glance.
    epicTitles = new Map([...planned, ...unplanned].map((item) => [String(item.id), item.title]))
    reproject({ unplanned })
  }

  async function load(): Promise<void> {
    try {
      // The limit is asked for once. A project that has not set one, or a host
      // that refuses the read, simply draws no limits rather than failing the
      // board over a decoration.
      if (limit === null) {
        limit = await client
          .settings()
          .then((settings) => settings.workInProgressLimit)
          .catch(() => null)
      }
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
    // The question is answered by the time a write starts, so it comes down
    // with it rather than staying open over a board that has already changed.
    set({ ...state, busy: true, failure: null, confirmation: null })
    try {
      await run()
      await load()
      set({ ...state, busy: false })
    } catch (error: unknown) {
      set({ ...state, busy: false, failure: toFailure(error) })
    }
  }

  /**
   * The two transitions need the sprint's revision, and there is no sprint to
   * take one from unless one is open. Refusing here rather than sending a
   * command with a made-up revision keeps the failure at the point where it
   * can be read as a bug.
   */
  function requireSelected(): Sprint {
    if (state.selected === null) {
      throw new Error('no sprint is selected')
    }
    return state.selected
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
    setLane: (lane: BoardLane) => {
      reproject({ lane })
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
    move: async (
      item: WorkItemRef,
      status: WorkItemStatus,
      resolution: WorkItemResolution | null = null,
    ) => {
      await write(
        async () =>
          await client.moveWorkItemStatus({
            ...item,
            status,
            // Absent rather than null: the domain defaults an unnamed outcome
            // to done, and refuses one aimed at any other column.
            ...(resolution === null ? {} : { resolution }),
          }),
      )
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
    /**
     * The unfinished list comes from what the board is showing rather than
     * from a fresh read: it is the same answer the columns were drawn from, so
     * the dispositions offered are exactly the cards in front of the user.
     */
    ask: (kind: 'start' | 'close') => {
      const sprint = state.selected
      if (sprint === null) {
        return
      }
      set({
        ...state,
        failure: null,
        confirmation:
          kind === 'start'
            ? { kind, sprint }
            : { kind, sprint, unfinished: planned.filter((item) => !isWorkItemFinished(item)) },
      })
    },
    cancel: () => {
      set({ ...state, confirmation: null })
    },
    start: async () => {
      const sprint = requireSelected()
      await write(
        async () =>
          await client.startSprint({ sprintId: sprint.id, expectedRevision: sprint.revision }),
      )
    },
    /**
     * Every unfinished item is named. The use case refuses a close that leaves
     * one unaccounted for, because "back to the backlog" and "into the next
     * sprint" mean different things to the next planning session and nothing
     * here can know which was meant.
     */
    close: async (resultSummary: string, dispositions: readonly Disposition[]) => {
      const sprint = requireSelected()
      await write(
        async () =>
          await client.closeSprint({
            sprintId: sprint.id,
            expectedRevision: sprint.revision,
            resultSummary,
            dispositions,
          }),
      )
    },
  }
}
