import type { WorkItem, WorkItemId } from '@dsh-scrum/scrum-domain'
import { backlogPage, BACKLOG_GROUPING, type BacklogGrouping, type BacklogPage } from './backlog.js'
import type {
  BacklogQuery,
  BlockWorkItem,
  DependWorkItem,
  EditWorkItem,
  NewWorkItem,
  ParentWorkItem,
  RankWorkItem,
  ScrumClient,
  SetCriterion,
} from './client.js'
import { toFailure, type ScrumFailure } from './failure.js'

/**
 * The product backlog is the work nobody has planned yet, so that is what the
 * screen asks for. Widening to everything is a switch the user throws, not a
 * default that quietly turns the backlog into a list of all work items.
 */
export const DEFAULT_BACKLOG_QUERY: BacklogQuery = { planned: false }

/**
 * What the backlog screen is showing.
 *
 * `failure` is a field rather than a phase because the two kinds of failure
 * have to look different. A load that failed leaves nothing to show, so the
 * phase becomes `failed`; a write that was refused leaves the list exactly as
 * it was and adds a message above it — blanking a screen full of work because
 * one edit was rejected would lose the user's place for no reason.
 */
export interface BacklogState {
  readonly phase: 'loading' | 'ready' | 'failed'
  readonly query: BacklogQuery
  readonly grouping: BacklogGrouping
  readonly page: BacklogPage
  /**
   * Everything that was read, in rank order and ungrouped. Reordering derives
   * its target from this rather than from the group a row is drawn in: rank is
   * one order over the project, and a move computed inside a group would land
   * the item somewhere the user did not aim.
   */
  readonly ordered: readonly WorkItem[]
  /** The item the detail panel is open on, resolved from the loaded list. */
  readonly selected: WorkItem | null
  readonly failure: ScrumFailure | null
  /** A write is in flight; the screen stays readable and the controls rest. */
  readonly busy: boolean
}

export interface BacklogController {
  readonly state: () => BacklogState
  readonly subscribe: (listener: () => void) => () => void
  readonly load: () => Promise<void>
  readonly setQuery: (query: BacklogQuery) => Promise<void>
  readonly setGrouping: (grouping: BacklogGrouping) => void
  readonly select: (id: WorkItemId | null) => void
  readonly dismiss: () => void
  readonly create: (input: NewWorkItem) => Promise<void>
  readonly edit: (command: EditWorkItem) => Promise<void>
  readonly setCriterion: (command: SetCriterion) => Promise<void>
  readonly rank: (command: RankWorkItem) => Promise<void>
  readonly setParent: (command: ParentWorkItem) => Promise<void>
  readonly setDependency: (command: DependWorkItem) => Promise<void>
  readonly block: (command: BlockWorkItem) => Promise<void>
}

/**
 * Whether the user narrowed anything.
 *
 * The sprint scope is excluded: it is the screen's own definition of what a
 * product backlog is, not something the user typed, and counting it would make
 * an empty project report that its filter is too tight.
 */
function isNarrowed(query: BacklogQuery): boolean {
  return (
    (query.text ?? '') !== '' ||
    (query.types?.length ?? 0) > 0 ||
    (query.priorities?.length ?? 0) > 0 ||
    (query.labels?.length ?? 0) > 0 ||
    query.blocked !== undefined
  )
}

const EMPTY_PAGE: BacklogPage = { groups: [], total: 0, emptiness: 'no-items' }

export function createBacklogController(
  client: ScrumClient,
  query: BacklogQuery = DEFAULT_BACKLOG_QUERY,
): BacklogController {
  let items: readonly WorkItem[] = []
  let selectedId: WorkItemId | null = null
  let state: BacklogState = {
    phase: 'loading',
    query,
    grouping: BACKLOG_GROUPING.none,
    page: EMPTY_PAGE,
    ordered: [],
    selected: null,
    failure: null,
    busy: false,
  }
  const listeners = new Set<() => void>()

  function set(next: BacklogState): void {
    state = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  /**
   * Rebuilds the page from the items last read.
   *
   * The selection is resolved here rather than stored as an item: an item that
   * was deleted or filtered away between two reads must not stay on screen as
   * a detail panel nothing can write to.
   */
  function reproject(patch: Partial<BacklogState> = {}): void {
    set({
      ...state,
      ...patch,
      page: backlogPage(items, patch.grouping ?? state.grouping, isNarrowed(state.query)),
      ordered: items,
      selected: items.find((item) => item.id === selectedId) ?? null,
    })
  }

  async function load(): Promise<void> {
    try {
      items = await client.backlog(state.query)
      reproject({ phase: 'ready' })
    } catch (error: unknown) {
      items = []
      reproject({ phase: 'failed', failure: toFailure(error), busy: false })
    }
  }

  /**
   * Runs one write and reads the list back.
   *
   * Reading back rather than patching the item the call returned: rank,
   * parenthood and blocking each move more than the row that was touched, and
   * a list assembled from one response would be a second answer that can
   * disagree with the store. A refused write leaves the list untouched and
   * reports why, so nothing is lost while the user decides what to do.
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
    setQuery: async (next: BacklogQuery) => {
      set({ ...state, query: next, phase: 'loading', failure: null })
      await load()
    },
    setGrouping: (grouping: BacklogGrouping) => {
      reproject({ grouping })
    },
    select: (id: WorkItemId | null) => {
      selectedId = id
      reproject()
    },
    dismiss: () => {
      set({ ...state, failure: null })
    },
    create: async (input: NewWorkItem) => {
      await write(async () => await client.createWorkItem(input))
    },
    edit: async (command: EditWorkItem) => {
      await write(async () => await client.updateWorkItem(command))
    },
    setCriterion: async (command: SetCriterion) => {
      await write(async () => await client.setAcceptanceCriterion(command))
    },
    rank: async (command: RankWorkItem) => {
      await write(async () => await client.moveWorkItemToRank(command))
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
