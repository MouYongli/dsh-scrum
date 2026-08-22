import { describe, expect, it } from 'vitest'
import { PERMISSION, type Permission } from '@dsh-scrum/scrum-domain'
import { SCRUM_ACCESS_MODE, describeSession, effectiveMode } from '@dsh-scrum/scrum-ui'
import type { SessionView } from '@dsh-scrum/scrum-ui'

const READS: readonly Permission[] = [PERMISSION.projectView, PERMISSION.backlogView]
const WRITES: readonly Permission[] = [...READS, PERMISSION.workItemWrite]

function view(overrides: Partial<SessionView> = {}): SessionView {
  return {
    mode: SCRUM_ACCESS_MODE.write,
    granted: WRITES,
    permissions: WRITES,
    projectArchived: false,
    ...overrides,
  }
}

describe('what a permission set amounts to', () => {
  it('reads nothing at all as off', () => {
    expect(effectiveMode([])).toBe(SCRUM_ACCESS_MODE.off)
  })

  it('reads read-only permissions as read', () => {
    expect(effectiveMode(READS)).toBe(SCRUM_ACCESS_MODE.read)
  })

  it('reads one writing permission as write', () => {
    expect(effectiveMode(WRITES)).toBe(SCRUM_ACCESS_MODE.write)
  })
})

describe('explaining what the session actually has', () => {
  it('says nothing when the chosen mode is in force', () => {
    expect(describeSession(view(), true)).toEqual({
      chosen: SCRUM_ACCESS_MODE.write,
      effective: SCRUM_ACCESS_MODE.write,
      degradations: [],
    })
  })

  it('says nothing when the user chose the lower mode themselves', () => {
    const summary = describeSession(
      view({ mode: SCRUM_ACCESS_MODE.read, permissions: READS }),
      true,
    )

    expect(summary.effective).toBe(SCRUM_ACCESS_MODE.read)
    expect(summary.degradations).toEqual([])
  })

  it('names the archive when write has quietly become read', () => {
    const summary = describeSession(view({ permissions: READS, projectArchived: true }), true)

    expect(summary.effective).toBe(SCRUM_ACCESS_MODE.read)
    expect(summary.degradations).toContain('archived')
  })

  it('names the roles when they no longer allow writing', () => {
    const summary = describeSession(view({ granted: READS, permissions: READS }), true)

    expect(summary.degradations).toEqual(['roles'])
  })

  it('names the binding when the workspace no longer has a project', () => {
    const summary = describeSession(view(), false)

    expect(summary.effective).toBe(SCRUM_ACCESS_MODE.off)
    expect(summary.degradations).toContain('binding')
  })

  it('keeps reporting what the user chose, so the control still shows it', () => {
    expect(describeSession(view({ permissions: [] }), false).chosen).toBe(SCRUM_ACCESS_MODE.write)
  })
})
