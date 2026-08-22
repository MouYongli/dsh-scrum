import { describe, expect, it } from 'vitest'
import { PERMISSION, PROJECT_ROLE, PROJECT_STATUS } from '@dsh-scrum/scrum-domain'
import {
  ACCESS_MODE,
  archiveProject,
  createSessionAccess,
  readSessionAccess,
  resolveSessionAuthorization,
  sessionPermissions,
  setAccessMode,
  setSessionAccess,
  toAccessMode,
} from '@dsh-scrum/scrum-application'
import { NOW, OTHER_ID, actor, dependencies } from '../support/fakes.js'
import { memberWithRoles, project } from '../support/project.js'

const SESSION = { harnessInstanceId: 'dsh_local_1', sessionId: 'session_1' }

async function caught(run: Promise<unknown>): Promise<{ code?: string }> {
  return (await run.catch((error: unknown) => error)) as { code?: string }
}

describe('the access mode', () => {
  it('publishes exactly these modes', () => {
    expect(toAccessMode('off')).toBe(ACCESS_MODE.off)
    expect(() => toAccessMode('readonly')).toThrow(/AccessMode/)
  })

  it('starts off, because nobody has decided otherwise', () => {
    const access = createSessionAccess({ ...SESSION, now: NOW })

    expect(access.accessMode).toBe(ACCESS_MODE.off)
  })

  it('refuses a change to the mode it already holds', () => {
    const access = createSessionAccess({ ...SESSION, now: NOW })

    expect(() => setAccessMode(access, ACCESS_MODE.off, NOW)).toThrow(/already off/)
  })

  it('advances the revision when the mode changes', () => {
    const access = createSessionAccess({ ...SESSION, now: NOW })

    const enabled = setAccessMode(access, ACCESS_MODE.write, NOW)

    expect(enabled.accessMode).toBe(ACCESS_MODE.write)
    expect(enabled.revision).toBe(access.revision + 1)
  })

  it('refuses a reference with nothing in it', () => {
    expect(() => createSessionAccess({ ...SESSION, sessionId: '  ', now: NOW })).toThrow(
      /session id/,
    )
  })
})

describe('sessionPermissions', () => {
  const granted = new Set([
    PERMISSION.projectView,
    PERMISSION.backlogView,
    PERMISSION.reportView,
    PERMISSION.workItemWrite,
    PERMISSION.projectArchive,
  ])

  it('gives an off session nothing at all', () => {
    const permissions = sessionPermissions({
      granted,
      mode: ACCESS_MODE.off,
      projectStatus: PROJECT_STATUS.active,
    })

    expect([...permissions]).toEqual([])
  })

  it('keeps only the reading permissions for a read session', () => {
    const permissions = sessionPermissions({
      granted,
      mode: ACCESS_MODE.read,
      projectStatus: PROJECT_STATUS.active,
    })

    expect([...permissions].sort()).toEqual(['backlog.view', 'project.view', 'report.view'])
  })

  it('passes everything through for a write session', () => {
    const permissions = sessionPermissions({
      granted,
      mode: ACCESS_MODE.write,
      projectStatus: PROJECT_STATUS.active,
    })

    expect(permissions.has(PERMISSION.workItemWrite)).toBe(true)
  })

  it('degrades a write session to read once the project is archived', () => {
    const permissions = sessionPermissions({
      granted,
      mode: ACCESS_MODE.write,
      projectStatus: PROJECT_STATUS.archived,
    })

    expect(permissions.has(PERMISSION.workItemWrite)).toBe(false)
    expect(permissions.has(PERMISSION.backlogView)).toBe(true)
  })

  it('never widens what the role already withheld', () => {
    const permissions = sessionPermissions({
      granted: new Set([PERMISSION.projectView]),
      mode: ACCESS_MODE.write,
      projectStatus: PROJECT_STATUS.active,
    })

    expect([...permissions]).toEqual([PERMISSION.projectView])
  })
})

describe('setSessionAccess', () => {
  it('records the decision every later agent write rests on', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const access = await setSessionAccess(deps, {
      actor: actor(),
      command: { ...SESSION, projectId: stored.project.id, mode: ACCESS_MODE.write },
    })

    expect(access.accessMode).toBe(ACCESS_MODE.write)
    expect(await readSessionAccess(deps, SESSION)).toBe(ACCESS_MODE.write)
    expect(deps.activity.events).toMatchObject([
      { action: 'session.access', targetType: 'session', targetId: 'dsh_local_1/session_1' },
    ])
  })

  it('refuses an actor who could not open the project anyway', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const error = await caught(
      setSessionAccess(deps, {
        actor: actor({ identityId: OTHER_ID }),
        command: { ...SESSION, projectId: stored.project.id, mode: ACCESS_MODE.write },
      }),
    )

    expect(error.code).toBe('FORBIDDEN')
    expect(await readSessionAccess(deps, SESSION)).toBe(ACCESS_MODE.off)
  })

  it('keeps one instance answer from becoming another', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    await setSessionAccess(deps, {
      actor: actor(),
      command: { ...SESSION, projectId: stored.project.id, mode: ACCESS_MODE.write },
    })

    const elsewhere = await readSessionAccess(deps, {
      harnessInstanceId: 'dsh_local_2',
      sessionId: 'session_1',
    })

    expect(elsewhere).toBe(ACCESS_MODE.off)
  })
})

describe('resolveSessionAuthorization', () => {
  it('reports nothing for a session nobody has enabled', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const resolved = await resolveSessionAuthorization(deps, {
      actor: actor(),
      command: { ...SESSION, projectId: stored.project.id },
    })

    expect(resolved.mode).toBe(ACCESS_MODE.off)
    expect([...resolved.permissions]).toEqual([])
    // The unrestricted set travels back, so a caller can tell "switched off"
    // from "this actor has no roles".
    expect(resolved.granted.size).toBeGreaterThan(0)
  })

  it('degrades immediately when the mode is lowered', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const command = { ...SESSION, projectId: stored.project.id }
    await setSessionAccess(deps, { actor: actor(), command: { ...command, mode: 'write' } })
    const writing = await resolveSessionAuthorization(deps, { actor: actor(), command })

    await setSessionAccess(deps, { actor: actor(), command: { ...command, mode: 'read' } })
    const reading = await resolveSessionAuthorization(deps, { actor: actor(), command })

    expect(writing.permissions.has(PERMISSION.workItemWrite)).toBe(true)
    expect(reading.permissions.has(PERMISSION.workItemWrite)).toBe(false)
  })

  it('degrades immediately when the project is archived', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const command = { ...SESSION, projectId: stored.project.id }
    await setSessionAccess(deps, { actor: actor(), command: { ...command, mode: 'write' } })

    await archiveProject(deps, { actor: actor(), command: { projectId: stored.project.id } })
    const resolved = await resolveSessionAuthorization(deps, { actor: actor(), command })

    expect(resolved.mode).toBe(ACCESS_MODE.write)
    expect(resolved.permissions.has(PERMISSION.workItemWrite)).toBe(false)
    expect(resolved.permissions.has(PERMISSION.backlogView)).toBe(true)
  })

  it('reports nothing for an actor whose roles carry nothing', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    memberWithRoles(deps, stored, OTHER_ID, [PROJECT_ROLE.stakeholder])
    await setSessionAccess(deps, {
      actor: actor(),
      command: { ...SESSION, projectId: stored.project.id, mode: ACCESS_MODE.write },
    })

    const resolved = await resolveSessionAuthorization(deps, {
      actor: actor({ identityId: OTHER_ID }),
      command: { ...SESSION, projectId: stored.project.id },
    })

    expect(resolved.permissions.has(PERMISSION.workItemWrite)).toBe(false)
    expect(resolved.permissions.has(PERMISSION.backlogView)).toBe(true)
  })
})
