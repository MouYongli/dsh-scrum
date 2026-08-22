import { describe, expect, it } from 'vitest'
import { ACTIVITY_SOURCES } from '@dsh-scrum/scrum-application'
import { ACTIVITY_SOURCE } from '@dsh-scrum/adapter-storage-workspace-files'

// This store defines its own copy of the activity vocabulary: it was written
// before the application layer existed, and the copy disappears once the store
// implements `ActivityRecorder` at composition time. Until then the two are
// structurally identical union types, so TypeScript would not notice them
// drifting apart — a value added to one and not the other type-checks
// everywhere and surfaces only as a record nobody can decode.

describe('stored activity sources', () => {
  it('stay inside the vocabulary the application publishes', () => {
    const published = new Set<string>(ACTIVITY_SOURCES)
    const unknown = Object.values(ACTIVITY_SOURCE).filter((source) => !published.has(source))

    expect(unknown).toEqual([])
  })
})
