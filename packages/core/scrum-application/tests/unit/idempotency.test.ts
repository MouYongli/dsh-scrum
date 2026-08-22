import { describe, expect, it, vi } from 'vitest'
import { ConflictError, ValidationError, type JsonValue } from '@dsh-scrum/scrum-domain'
import { runIdempotently, type IdempotentOperation } from '@dsh-scrum/scrum-application'
import { OTHER_ID, actor, dependencies, type TestDependencies } from '../support/fakes.js'

function counting(
  key: string | undefined,
  action = 'project.create',
): IdempotentOperation<string> & { performed: number; replayed: JsonValue[] } {
  const operation = {
    action,
    key,
    performed: 0,
    replayed: [] as JsonValue[],
    perform: async () => {
      operation.performed += 1
      return { reference: 'prj_1', result: `performed ${operation.performed}` }
    },
    replay: async (reference: JsonValue) => {
      operation.replayed.push(reference)
      return 'replayed'
    },
  }
  return operation
}

async function caught(run: Promise<unknown>): Promise<{ code?: string }> {
  return (await run.catch((error: unknown) => error)) as { code?: string }
}

describe('runIdempotently', () => {
  it('runs every time when no key is supplied', async () => {
    const deps = dependencies()
    const operation = counting(undefined)

    expect(await runIdempotently(deps, actor(), operation)).toBe('performed 1')
    expect(await runIdempotently(deps, actor(), operation)).toBe('performed 2')
    expect(deps.idempotency.records.size).toBe(0)
  })

  it('performs once and replays the second call', async () => {
    const deps = dependencies()
    const operation = counting('retry-1')

    const first = await runIdempotently(deps, actor(), operation)
    const second = await runIdempotently(deps, actor(), operation)

    expect(first).toBe('performed 1')
    expect(second).toBe('replayed')
    expect(operation.performed).toBe(1)
    // The replay is handed the stored pointer, not a stored copy of the result.
    expect(operation.replayed).toEqual(['prj_1'])
  })

  it('trims the key so two spellings of one key are one key', async () => {
    const deps = dependencies()

    await runIdempotently(deps, actor(), counting('retry-1'))
    const operation = counting('  retry-1  ')
    await runIdempotently(deps, actor(), operation)

    expect(operation.performed).toBe(0)
  })

  it('refuses a key that was used for a different operation', async () => {
    const deps = dependencies()
    await runIdempotently(deps, actor(), counting('retry-1', 'project.create'))

    const error = await caught(
      runIdempotently(deps, actor(), counting('retry-1', 'project.archive')),
    )

    expect(error.code).toBe('VALIDATION')
  })

  it('refuses to replay another actor result', async () => {
    const deps = dependencies()
    await runIdempotently(deps, actor(), counting('retry-1'))

    const error = await caught(
      runIdempotently(deps, actor({ identityId: OTHER_ID }), counting('retry-1')),
    )

    expect(error.code).toBe('FORBIDDEN')
  })

  it('accepts losing the race to record the key', async () => {
    const deps = dependencies()
    // Both callers missed the lookup and both performed the work; the store is
    // the only place left that can settle it, and it did.
    vi.spyOn(deps.idempotency, 'save').mockRejectedValue(
      new ConflictError('already recorded', 0, 0, {}),
    )

    expect(await runIdempotently(deps, actor(), counting('retry-1'))).toBe('performed 1')
  })

  it('does not hide a store failure that is not a lost race', async () => {
    const deps: TestDependencies = dependencies()
    vi.spyOn(deps.idempotency, 'save').mockRejectedValue(new ValidationError('disk is full'))

    const error = await caught(runIdempotently(deps, actor(), counting('retry-1')))

    expect(error.code).toBe('VALIDATION')
  })

  it('rejects an empty key rather than treating it as absent', async () => {
    const deps = dependencies()

    const error = await caught(runIdempotently(deps, actor(), counting('   ')))

    expect(error.code).toBe('VALIDATION')
  })
})
