import { describe, expect, it } from 'vitest'
import {
  HIGH_IMPACT_TOOLS,
  READ_TOOL_NAMES,
  WRITE_TOOL,
  WRITE_TOOL_NAMES,
  confirmationFor,
  isHighImpactTool,
} from '@dsh-scrum/scrum-agent-tools'

// `ask` is resolved by the Harness approval service, and a deployment without
// one turns it into a denial. That is the right way round: an agent that
// cannot reach a human must not close somebody's sprint because nobody was
// there to object.

describe('which tools ask first', () => {
  it('asks for exactly the four the product design calls high impact', () => {
    expect([...HIGH_IMPACT_TOOLS]).toEqual([
      'scrum_start_sprint',
      'scrum_close_sprint',
      'scrum_delete_work_item',
      'scrum_change_project_settings',
    ])
  })

  it('lets every read through without asking', () => {
    for (const name of READ_TOOL_NAMES) {
      expect(confirmationFor(name)).toEqual({ kind: 'allow' })
    }
  })

  it('lets an ordinary edit through without asking', () => {
    expect(confirmationFor(WRITE_TOOL.updateWorkItem)).toEqual({ kind: 'allow' })
    expect(confirmationFor(WRITE_TOOL.moveWorkItem)).toEqual({ kind: 'allow' })
  })

  it('asks before every high impact call, and says why', () => {
    for (const name of HIGH_IMPACT_TOOLS) {
      const decision = confirmationFor(name)

      expect(decision.kind).toBe('ask')
      expect(decision.kind === 'ask' && decision.reason.length).toBeGreaterThan(20)
    }
  })

  it('leaves a tool nobody classified alone rather than guessing', () => {
    expect(confirmationFor('bash')).toEqual({ kind: 'allow' })
    expect(isHighImpactTool('bash')).toBe(false)
  })

  it('classifies every write tool one way or the other', () => {
    const ordinary = WRITE_TOOL_NAMES.filter((name) => !isHighImpactTool(name))

    expect(ordinary.length + HIGH_IMPACT_TOOLS.length).toBe(WRITE_TOOL_NAMES.length)
  })
})
