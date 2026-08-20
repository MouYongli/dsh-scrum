import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  assertSupportedSchemaVersion,
  createEntityMetadata,
  toRevision,
  toTimestamp,
  touchEntityMetadata,
  type EntityMetadata,
} from '@dsh-scrum/scrum-domain'

const CREATED = toTimestamp('2026-08-20T10:00:00Z')
const UPDATED = toTimestamp('2026-08-20T12:00:00Z')

/** The read path a storage adapter performs: plain JSON back into domain values. */
function parseMetadata(raw: Record<string, unknown>): EntityMetadata {
  return {
    schemaVersion: assertSupportedSchemaVersion(raw['schemaVersion'] as number),
    revision: toRevision(raw['revision'] as number),
    createdAt: toTimestamp(raw['createdAt'] as string),
    updatedAt: toTimestamp(raw['updatedAt'] as string),
  }
}

// Field names and value spellings here are the persisted format described in
// docs/development/architecture.md section 10.2. Changing any of them is a
// storage format change and needs a schema version bump plus a migration.
describe('entity metadata persistence contract', () => {
  it('serializes to the documented field names and value shapes', () => {
    const metadata = touchEntityMetadata(createEntityMetadata(CREATED), UPDATED)

    expect(JSON.parse(JSON.stringify(metadata))).toEqual({
      schemaVersion: 1,
      revision: 2,
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T12:00:00.000Z',
    })
  })

  it('survives a write and read round trip unchanged', () => {
    const metadata = touchEntityMetadata(createEntityMetadata(CREATED), UPDATED)
    const stored: unknown = JSON.parse(JSON.stringify(metadata))

    expect(parseMetadata(stored as Record<string, unknown>)).toEqual(metadata)
  })

  it('reads the documented project.json metadata block', () => {
    const projectFile = {
      schemaVersion: 1,
      projectId: 'prj_01K5TFQ8Z4N7C2M9XPRWD3HABV',
      edition: 'community',
      key: 'SCR',
      name: 'shop-service',
      revision: 1,
      createdAt: '2026-08-20T10:00:00Z',
      updatedAt: '2026-08-20T10:00:00Z',
    }

    expect(parseMetadata(projectFile)).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: 1,
      createdAt: CREATED,
      updatedAt: CREATED,
    })
  })

  it('refuses a file written by a newer schema version', () => {
    const fromNewerPlugin = {
      schemaVersion: 2,
      revision: 1,
      createdAt: '2026-08-20T10:00:00Z',
      updatedAt: '2026-08-20T10:00:00Z',
    }

    expect(() => parseMetadata(fromNewerPlugin)).toThrowError(/schema version 2 is not supported/)
  })
})
