import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PERMISSION, PROJECT_ROLES, WORK_ITEM_STATUS } from '@dsh-scrum/scrum-domain'
import { ProjectSettings, createTranslate } from '@dsh-scrum/scrum-ui'
import type { AuthorizationView, ProjectSettingsView, SettingsState } from '@dsh-scrum/scrum-ui'

const t = createTranslate()

const SETTINGS: ProjectSettingsView = {
  revision: 3 as ProjectSettingsView['revision'],
  statuses: [WORK_ITEM_STATUS.backlog, WORK_ITEM_STATUS.inProgress, WORK_ITEM_STATUS.done],
  statusDisplayNames: { in_progress: '进行中' },
  estimationMethod: 'story_points',
  sprintLengthInDays: 14,
  definitionOfReady: ['有验收标准'],
  definitionOfDone: ['已评审', '已部署'],
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

function state(overrides: Partial<SettingsState> = {}): SettingsState {
  return {
    phase: 'ready',
    settings: SETTINGS,
    failure: null,
    busy: false,
    saved: false,
    ...overrides,
  }
}

function render(overrides: Partial<SettingsState> = {}, readOnly = false): string {
  return renderToStaticMarkup(
    createElement(ProjectSettings, {
      state: state(overrides),
      authorization: AUTHORIZATION,
      readOnly,
      t,
      actions: { save: vi.fn(), reload: vi.fn(), dismiss: vi.fn() },
    }),
  )
}

describe('the states the settings page can be in', () => {
  it('says it is reading, and shows no form yet', () => {
    const markup = render({ phase: 'loading', settings: null })

    expect(markup).toContain('data-scrum-settings="loading"')
    expect(markup).not.toContain('data-scrum-settings-section')
  })

  it('offers a re-read when the configuration could not be read', () => {
    const markup = render({
      phase: 'failed',
      settings: null,
      failure: { kind: 'other', message: '主机不可达' },
    })

    expect(markup).toContain('主机不可达')
    expect(markup).toContain('data-scrum-settings-retry')
  })
})

describe('what the form shows', () => {
  it('carries every stored setting', () => {
    const markup = render()

    expect(markup).toContain('value="进行中"')
    expect(markup).toContain('已评审\n已部署')
    expect(markup).toContain('有验收标准')
    // The numbers, each in its own box.
    expect(markup).toContain('id="scrum-settings-sprint-length"')
    expect(markup).toContain('id="scrum-settings-wip"')
    expect(markup).toContain('id="scrum-settings-stalled"')
  })

  it('offers a name box only for the statuses the project actually has', () => {
    const markup = render()

    expect(markup).toContain(`id="scrum-settings-name-${WORK_ITEM_STATUS.inProgress}"`)
    expect(markup).not.toContain(`id="scrum-settings-name-${WORK_ITEM_STATUS.review}"`)
  })

  it('names what the installation provides rather than leaving it to be inferred', () => {
    // "This edition does not do that" and "you may not do that" are different
    // answers, and a page showing neither leaves somebody hunting for a button
    // that was never going to be there.
    const markup = render()

    expect(markup).toContain('data-scrum-capability="scrum.core"')
    expect(markup).toContain(t('settings.capabilities.hint'))
  })
})

describe('when it may not be changed', () => {
  it('shows every value and no way to save', () => {
    const markup = render({}, true)

    expect(markup).toContain('value="进行中"')
    expect(markup).toContain('disabled=""')
    expect(markup).not.toContain('data-scrum-settings-save')
  })
})

describe('after a save', () => {
  it('says so, once', () => {
    expect(render({ saved: true })).toContain('data-scrum-settings-saved')
  })

  it('offers a re-read for a conflict and a dismissal for anything else', () => {
    const conflict = render({ failure: { kind: 'conflict', message: '配置已被改动' } })
    expect(conflict).toContain('data-scrum-settings-failure="conflict"')
    expect(conflict).toContain('data-scrum-settings-retry')
    // The form is still there: a refused save must not cost the user what they
    // typed.
    expect(conflict).toContain('data-scrum-settings-section="workflow"')

    const other = render({ failure: { kind: 'other', message: '写入失败' } })
    expect(other).toContain('data-scrum-dismiss')
    expect(other).not.toContain('data-scrum-settings-retry')
  })
})
