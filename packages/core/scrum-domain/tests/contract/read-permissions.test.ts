import { describe, expect, it } from 'vitest'
import { PERMISSIONS, READ_PERMISSIONS, isReadPermission } from '@dsh-scrum/scrum-domain'

// A read-only session is the granted set intersected with this list, so a
// permission classified wrongly is either a write an agent should not have
// made or a read it was refused for no reason.

describe('permission kinds', () => {
  it('classifies exactly these as reading', () => {
    expect([...READ_PERMISSIONS].sort()).toEqual(['backlog.view', 'project.view', 'report.view'])
  })

  it('classifies every other published permission as changing something', () => {
    const changing = PERMISSIONS.filter((permission) => !isReadPermission(permission))

    expect(changing).toHaveLength(PERMISSIONS.length - READ_PERMISSIONS.length)
    // A suggestion is an artefact that gets stored once there is anywhere to
    // store it, and a classification that is a guess should guess closed.
    expect(changing).toContain('workItem.suggest')
  })
})
