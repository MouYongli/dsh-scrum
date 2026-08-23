// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION, PROJECT_ROLES, WORK_ITEM_STATUS } from '@dsh-scrum/scrum-domain'
import { ProjectSettings, createTranslate } from '@dsh-scrum/scrum-ui'
import type {
  AuthorizationView,
  ProjectSettingsView,
  SettingsActions,
  SettingsState,
} from '@dsh-scrum/scrum-ui'
import { mount, type Mounted } from '../support/dom.js'

const t = createTranslate()
let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

const SETTINGS: ProjectSettingsView = {
  revision: 3 as ProjectSettingsView['revision'],
  statuses: [WORK_ITEM_STATUS.backlog, WORK_ITEM_STATUS.inProgress],
  statusDisplayNames: { in_progress: '进行中' },
  estimationMethod: 'story_points',
  sprintLengthInDays: 14,
  definitionOfReady: [],
  definitionOfDone: ['已评审'],
  workInProgressLimit: 3,
  velocityBasis: 'delivered',
  stalledAfterDays: 5,
}

const AUTHORIZATION: AuthorizationView = {
  permissions: [PERMISSION.projectConfigure],
  capabilities: ['scrum.core'],
  projectArchived: false,
  membership: { mode: 'personal', roles: PROJECT_ROLES },
}

function page(overrides: Partial<SettingsState> = {}): {
  mounted: Mounted
  actions: SettingsActions
} {
  const actions: SettingsActions = { save: vi.fn(), reload: vi.fn(), dismiss: vi.fn() }
  const mounted = mount(
    createElement(ProjectSettings, {
      state: {
        phase: 'ready',
        settings: SETTINGS,
        failure: null,
        busy: false,
        saved: false,
        ...overrides,
      },
      authorization: AUTHORIZATION,
      readOnly: false,
      t,
      actions,
    }),
  )
  open = mounted
  return { mounted, actions }
}

describe('saving the configuration', () => {
  it('sends every field, not only the one that changed', () => {
    const { mounted, actions } = page()

    mounted.type('#scrum-settings-stalled', '7')
    mounted.submit('[data-scrum-settings="ready"]')

    expect(actions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        stalledAfterDays: 7,
        sprintLengthInDays: 14,
        definitionOfDone: ['已评审'],
        velocityBasis: 'delivered',
      }),
    )
  })

  it('reads a checklist a line at a time, dropping the blank lines', () => {
    const { mounted, actions } = page()

    mounted.type('#scrum-settings-done', '已评审\n\n  已部署  \n')
    mounted.submit('[data-scrum-settings="ready"]')

    expect(actions.save).toHaveBeenCalledWith(
      expect.objectContaining({ definitionOfDone: ['已评审', '已部署'] }),
    )
  })

  it('sends an empty limit box as no limit rather than as zero', () => {
    const { mounted, actions } = page()

    mounted.type('#scrum-settings-wip', '')
    mounted.submit('[data-scrum-settings="ready"]')

    expect(actions.save).toHaveBeenCalledWith(
      expect.objectContaining({ workInProgressLimit: null }),
    )
  })

  it('drops a cleared column name instead of renaming the column to nothing', () => {
    const { mounted, actions } = page()

    mounted.type(`#scrum-settings-name-${WORK_ITEM_STATUS.inProgress}`, '  ')
    mounted.submit('[data-scrum-settings="ready"]')

    expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ statusDisplayNames: {} }))
  })
})

describe('after a refusal', () => {
  it('asks for a fresh read on a conflict, and dismisses anything else', () => {
    const conflict = page({ failure: { kind: 'conflict', message: '配置已被改动' } })
    conflict.mounted.click('[data-scrum-settings-retry]')
    expect(conflict.actions.reload).toHaveBeenCalled()

    open?.unmount()
    const other = page({ failure: { kind: 'other', message: '写入失败' } })
    other.mounted.click('[data-scrum-dismiss]')
    expect(other.actions.dismiss).toHaveBeenCalled()
  })
})
