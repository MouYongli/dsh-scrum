import { describe, expect, it } from 'vitest'
import { ConflictError, ForbiddenError, NotFoundError } from '@dsh-scrum/scrum-domain'
import { toFailure } from '@dsh-scrum/scrum-ui'

describe('classifying what the client rejected with', () => {
  it('recognises a conflict, which is the one failure with a next step', () => {
    expect(toFailure(new ConflictError('work item SCR-1 has moved on', 2, 3))).toEqual({
      kind: 'conflict',
      message: 'work item SCR-1 has moved on',
    })
  })

  it('recognises a refusal and a missing entity separately', () => {
    expect(toFailure(new ForbiddenError('not allowed')).kind).toBe('forbidden')
    expect(toFailure(new NotFoundError('work item', 'SCR-9')).kind).toBe('missing')
  })

  it('recognises a conflict that crossed a transport and lost its class', () => {
    const rebuilt = { code: 'CONFLICT', message: '版本已变化', details: { actualRevision: 3 } }

    expect(toFailure(rebuilt)).toEqual({ kind: 'conflict', message: '版本已变化' })
  })

  it('reports anything else as itself, without inventing a code', () => {
    expect(toFailure(new Error('the host is not reachable'))).toEqual({
      kind: 'other',
      message: 'the host is not reachable',
    })
    expect(toFailure('boom')).toEqual({ kind: 'other', message: 'boom' })
    expect(toFailure({ code: 'NOT_A_SCRUM_CODE', message: 'x' }).kind).toBe('other')
  })
})
