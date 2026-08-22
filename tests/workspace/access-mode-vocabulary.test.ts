import { describe, expect, it } from 'vitest'
import { ACCESS_MODES } from '@dsh-scrum/scrum-application'
import { SCRUM_ACCESS_MODES } from '@dsh-scrum/scrum-ui'

// The interface declares the access modes itself so that `scrum-ui` stays free
// of the application layer. Two structurally identical unions are two things
// TypeScript will never notice drifting apart, so the agreement is asserted
// here, where both packages may be imported.

describe('the access mode vocabulary', () => {
  it('is the same set on both sides of the client interface', () => {
    expect([...SCRUM_ACCESS_MODES].sort()).toEqual([...ACCESS_MODES].sort())
  })
})
