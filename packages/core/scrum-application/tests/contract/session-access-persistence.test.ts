import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, toTimestamp } from '@dsh-scrum/scrum-domain'
import { ACCESS_MODES, createSessionAccess, setAccessMode } from '@dsh-scrum/scrum-application'

// `.scrum/` is committed to the user's repository as often as not. A field
// that can hold a token, a prompt or a tool log is a field that eventually
// holds one, so the stored key set is pinned: adding one has to be a change
// somebody made on purpose and this test is where they acknowledge it.

const NOW = toTimestamp('2026-08-22T09:00:00.000Z')

describe('the stored session access file', () => {
  it('carries exactly these fields and no others', () => {
    const access = setAccessMode(
      createSessionAccess({
        harnessInstanceId: 'dsh_local_1',
        sessionId: 'session_1',
        now: NOW,
      }),
      'write',
      NOW,
    )

    expect(Object.keys(access).sort()).toEqual([
      'accessMode',
      'createdAt',
      'harnessInstanceId',
      'revision',
      'schemaVersion',
      'sessionId',
      'updatedAt',
    ])
  })

  it('round trips through JSON without losing or gaining anything', () => {
    const access = createSessionAccess({
      harnessInstanceId: 'dsh_local_1',
      sessionId: 'session_1',
      now: NOW,
    })

    expect(JSON.parse(JSON.stringify(access))).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      harnessInstanceId: 'dsh_local_1',
      sessionId: 'session_1',
      accessMode: 'off',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it('publishes the access modes a stored file may name', () => {
    expect([...ACCESS_MODES]).toEqual(['off', 'read', 'write'])
  })
})
