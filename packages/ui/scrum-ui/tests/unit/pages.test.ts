import { describe, expect, it } from 'vitest'
import { MESSAGE_KEYS, SCRUM_MESSAGES, createTranslate, pageFor } from '@dsh-scrum/scrum-ui'
import type { EntryView } from '@dsh-scrum/scrum-ui'

const WORKSPACE = { id: 'ws_1', name: 'shop-service' }
const PROJECT = { id: 'prj_1', key: 'SCR', name: 'shop-service', description: '' }

describe('the first-run pages', () => {
  it('asks for a workspace before anything else', () => {
    const page = pageFor({ state: 'no-workspace' })

    expect(page.title).toBe('state.noWorkspace.title')
    expect(page.workspaceName).toBeNull()
    expect(page.action).toBeNull()
  })

  it('offers to create a project in an unbound workspace', () => {
    const page = pageFor({ state: 'unbound', workspace: WORKSPACE })

    expect(page.action).toEqual({ kind: 'create', label: 'state.unbound.create' })
    expect(page.connectAction).toEqual({ kind: 'connect', label: 'state.unbound.connect' })
    expect(page.workspaceName).toBe('shop-service')
  })

  it('offers nothing to create when the binding is stale', () => {
    const page = pageFor({ state: 'stale', workspace: WORKSPACE })

    expect(page.title).toBe('state.stale.title')
    expect(page.action).toBeNull()
  })

  it('shows an archived project as read-only rather than as ordinary', () => {
    const page = pageFor({
      state: 'archived',
      workspace: WORKSPACE,
      project: PROJECT,
      moved: false,
    })

    expect(page.title).toBe('state.archived.title')
    expect(page.project).toEqual({ key: 'SCR', name: 'shop-service' })
    expect(page.action).toBeNull()
  })

  it('raises a notice when the workspace has moved, in either bound state', () => {
    for (const state of ['bound', 'archived'] as const) {
      const entry: EntryView = { state, workspace: WORKSPACE, project: PROJECT, moved: true }

      expect(pageFor(entry).notice).toBe('state.moved.notice')
    }
  })

  it('raises no notice when it has not', () => {
    const page = pageFor({ state: 'bound', workspace: WORKSPACE, project: PROJECT, moved: false })

    expect(page.notice).toBeNull()
  })

  it('names a message that exists for every field it fills', () => {
    const entries: EntryView[] = [
      { state: 'no-workspace' },
      { state: 'unbound', workspace: WORKSPACE },
      { state: 'stale', workspace: WORKSPACE },
      { state: 'bound', workspace: WORKSPACE, project: PROJECT, moved: true },
      { state: 'archived', workspace: WORKSPACE, project: PROJECT, moved: true },
    ]

    for (const entry of entries) {
      const page = pageFor(entry)
      for (const key of [
        page.title,
        page.body,
        page.notice,
        page.action?.label,
        page.connectAction?.label,
      ]) {
        if (key !== null && key !== undefined) {
          expect(MESSAGE_KEYS).toContain(key)
        }
      }
    }
  })
})

describe('the copy', () => {
  it('says the same things in both languages', () => {
    expect(Object.keys(SCRUM_MESSAGES.en).sort()).toEqual(Object.keys(SCRUM_MESSAGES.zh).sort())
  })

  it('leaves no entry empty in either language', () => {
    for (const dictionary of [SCRUM_MESSAGES.zh, SCRUM_MESSAGES.en]) {
      for (const [key, text] of Object.entries(dictionary)) {
        expect(text.trim(), key).not.toBe('')
      }
    }
  })

  it('is Chinese by default, because that is the product language', () => {
    expect(createTranslate()('state.unbound.create')).toBe('创建本地项目')
    expect(createTranslate('en')('state.unbound.create')).toBe('Create local project')
  })

  it('holds no interpolation, so no sentence is built from fragments', () => {
    for (const dictionary of [SCRUM_MESSAGES.zh, SCRUM_MESSAGES.en]) {
      for (const text of Object.values(dictionary)) {
        expect(text).not.toMatch(/\{\{|\}\}|%s/)
      }
    }
  })
})
