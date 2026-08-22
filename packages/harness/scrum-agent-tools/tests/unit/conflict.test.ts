import { describe, expect, it } from 'vitest'
import { ConflictError, ValidationError } from '@dsh-scrum/scrum-domain'
import { attemptWrite, conflictOutcome } from '@dsh-scrum/scrum-agent-tools'

describe('a stale revision', () => {
  it('comes back as data the model can act on', () => {
    const outcome = conflictOutcome(
      new ConflictError('the work item changed since it was read', 4, 7, {
        entityType: 'workItem',
        entityId: 'SCR-12',
      }),
    )

    expect(outcome).toMatchObject({
      ok: false,
      reason: 'conflict',
      entityType: 'workItem',
      entityId: 'SCR-12',
      expectedRevision: 4,
      currentRevision: 7,
    })
    // Naming the current revision without saying what to do with it invites a
    // resend of the same call, which is a lost update written on purpose.
    expect(outcome.ok === false && outcome.advice).toMatch(/Do not repeat the call/)
  })

  it('falls back to a neutral entity when the error did not name one', () => {
    const outcome = conflictOutcome(new ConflictError('stale', 1, 2, {}))

    expect(outcome).toMatchObject({ entityType: 'entity', entityId: '' })
  })
})

describe('attemptWrite', () => {
  it('reports success with the value', async () => {
    expect(await attemptWrite(async () => ({ id: 'SCR-1' }))).toEqual({
      ok: true,
      result: { id: 'SCR-1' },
    })
  })

  it('turns a conflict into a result rather than a failure', async () => {
    const outcome = await attemptWrite(async () => {
      throw new ConflictError('stale', 1, 2, { entityType: 'sprint', entityId: 'sprint-1' })
    })

    expect(outcome.ok).toBe(false)
  })

  it('lets everything else through, because only a conflict is news', async () => {
    await expect(
      attemptWrite(async () => {
        throw new ValidationError('the title must not be empty')
      }),
    ).rejects.toThrow(/must not be empty/)
  })
})
