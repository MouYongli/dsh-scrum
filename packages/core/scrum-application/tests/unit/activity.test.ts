import { describe, expect, it } from 'vitest'
import { ValidationError, toRevision, toTimestamp } from '@dsh-scrum/scrum-domain'
import { ACTIVITY_SOURCE, recordActivity } from '@dsh-scrum/scrum-application'
import { ACTOR_ID, NOW, actor, dependencies } from '../support/fakes.js'

const DESCRIPTION = {
  action: 'project.archive',
  targetType: 'project',
  targetId: 'prj_1',
  revision: toRevision(2),
}

describe('recordActivity', () => {
  it('stamps the actor, the source, the session and the instant', async () => {
    const deps = dependencies()
    deps.clock.set(toTimestamp('2026-08-22T10:30:00.000Z'))

    await recordActivity(
      deps,
      actor({ source: ACTIVITY_SOURCE.agent, sessionId: 'session_1' }),
      DESCRIPTION,
    )

    expect(deps.activity.events).toEqual([
      {
        ...DESCRIPTION,
        at: toTimestamp('2026-08-22T10:30:00.000Z'),
        actorId: ACTOR_ID,
        source: ACTIVITY_SOURCE.agent,
        sessionId: 'session_1',
      },
    ])
  })

  it('records no session for a change made outside one', async () => {
    const deps = dependencies()

    await recordActivity(deps, actor(), DESCRIPTION)

    expect(deps.activity.events[0]).toMatchObject({ sessionId: null, at: NOW })
  })

  it('reports a failure to record rather than leaving a silent gap', async () => {
    const deps = dependencies()
    deps.activity.failWith = new ValidationError('the activity log is unwritable')

    const error = await recordActivity(deps, actor(), DESCRIPTION).catch(
      (caught: unknown) => caught,
    )

    expect((error as { code: string }).code).toBe('VALIDATION')
  })
})
