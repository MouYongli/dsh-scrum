import type { Edition } from './edition.js'
import { newTenantId, type IdGenerator, type IdentityId, type TenantId } from './ids.js'
import { createEntityMetadata, touchEntityMetadata, type EntityMetadata } from './metadata.js'
import { requireText } from './text.js'
import type { Timestamp } from './time.js'

const MAX_NAME_LENGTH = 120

/**
 * Top level boundary of data and permissions. Community creates one implicit
 * personal tenant so that the stored shape, the export format and the
 * permission model are the same ones a multi-tenant service uses; nothing in
 * Community reads more than a single tenant.
 *
 * Metadata is flat rather than nested, because the stored file is flat and the
 * entity is the stored shape. See `metadata.ts`.
 */
export interface Tenant extends EntityMetadata {
  readonly id: TenantId
  readonly edition: Edition
  readonly name: string
  readonly ownerIdentityId: IdentityId
}

export interface CreateTenantInput {
  readonly ids: IdGenerator
  readonly edition: Edition
  readonly name: string
  readonly ownerIdentityId: IdentityId
  readonly now: Timestamp
}

export function createTenant(input: CreateTenantInput): Tenant {
  return {
    ...createEntityMetadata(input.now),
    id: newTenantId(input.ids),
    edition: input.edition,
    name: requireText(input.name, 'Tenant name', MAX_NAME_LENGTH),
    ownerIdentityId: input.ownerIdentityId,
  }
}

/**
 * The only mutation a tenant has in this release. The owner is deliberately
 * not reassignable here: transferring ownership is a governance operation that
 * belongs to a service with more than one identity to transfer between.
 */
export function renameTenant(tenant: Tenant, name: string, now: Timestamp): Tenant {
  return {
    ...tenant,
    ...touchEntityMetadata(tenant, now),
    name: requireText(name, 'Tenant name', MAX_NAME_LENGTH),
  }
}
