import type { FileLockPort } from './locking.js'
import type { WorkspaceLayout } from './paths.js'

/**
 * Serialises every write to one workspace.
 *
 * Two layers, because they solve different problems. The promise chain
 * serialises callers inside this process, which is the common case and costs
 * nothing; the file lock serialises processes, which is what makes two Harness
 * windows on the same workspace safe. Relying on the file lock alone would
 * make in-process contention spin on the filesystem, and relying on the chain
 * alone would leave the case it exists for unprotected.
 *
 * This is what closes the gap the per-file revision check leaves open: a
 * writer can no longer read a revision while another is midway through
 * replacing it, because the second writer never starts until the first
 * finishes.
 */
export interface WriteCoordinator {
  run<Value>(work: () => Promise<Value>): Promise<Value>
}

export function createWriteCoordinator(
  layout: WorkspaceLayout,
  lock: FileLockPort,
): WriteCoordinator {
  let queue: Promise<unknown> = Promise.resolve()

  return {
    run<Value>(work: () => Promise<Value>): Promise<Value> {
      // The chain is advanced before awaiting, so a caller arriving during
      // this turn queues behind us rather than racing us to the lock.
      const result = queue.then(async () => {
        const held = await lock.acquire(layout.lock)
        try {
          return await work()
        } finally {
          await held.release()
        }
      })
      // Failures must not poison the queue for everyone behind them.
      queue = result.catch(() => undefined)
      return result
    },
  }
}
