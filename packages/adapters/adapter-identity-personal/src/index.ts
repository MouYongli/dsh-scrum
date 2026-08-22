import { newIdentityId, type IdGenerator, type IdentityId } from '@dsh-scrum/scrum-domain'

/**
 * Who the user is, in an edition that never asks.
 *
 * Community has no sign-in and no account, so an identity has to come from
 * somewhere that survives a restart, a reinstall and a move to another
 * machine. It comes from the data: a workspace that already holds a project
 * records who created it, and that is the identity every later call runs as.
 *
 * Deriving it from the installation instead — a digest of the Harness instance
 * id, say — would be simpler and wrong: reinstalling Harness would issue a new
 * identity and lock the user out of the project they had made, because the
 * permission check compares the actor against `project.createdBy`.
 */
export interface PersonalIdentityPort {
  /** The identity recorded on the workspace's project, or `null` if there is none yet. */
  creator(): Promise<IdentityId | null>
}

export interface PersonalIdentityInput {
  readonly port: PersonalIdentityPort
  readonly ids: IdGenerator
}

export interface PersonalIdentity {
  identity(): Promise<IdentityId>
}

/**
 * A fresh identifier is minted only for a workspace with no project, which is
 * the one moment nothing has recorded an answer yet. It is not remembered
 * here: the project that is about to be created records it, and a copy kept
 * beside that would be a second answer with nothing keeping the two in step.
 */
export function createPersonalIdentity(input: PersonalIdentityInput): PersonalIdentity {
  return {
    identity: async () => (await input.port.creator()) ?? newIdentityId(input.ids),
  }
}
