import { describe, expect, it } from 'vitest'
import { createPersonalIdentity } from '@dsh-scrum/adapter-identity-personal'
import { toIdentityId, type IdGenerator } from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const OTHER = '01K5TFQ8Z4N7C2M9XPRWD3HABW'
const ids: IdGenerator = { nextUlid: () => ULID }

describe('who the user is when nobody signs in', () => {
  it('is whoever created the project this workspace holds', async () => {
    const creator = toIdentityId(`idt_${OTHER}`)
    const identity = createPersonalIdentity({ port: { creator: async () => creator }, ids })

    expect(await identity.identity()).toBe(creator)
  })

  it('is the same answer on every call, because it comes from the data', async () => {
    const creator = toIdentityId(`idt_${OTHER}`)
    const identity = createPersonalIdentity({ port: { creator: async () => creator }, ids })

    expect(await identity.identity()).toBe(await identity.identity())
  })

  it('mints one only for a workspace that has no project yet', async () => {
    const identity = createPersonalIdentity({ port: { creator: async () => null }, ids })

    expect(await identity.identity()).toBe(toIdentityId(`idt_${ULID}`))
  })

  it('takes the recorded creator over anything it might have minted', async () => {
    const stored: (string | null)[] = [null, `idt_${OTHER}`]
    const identity = createPersonalIdentity({
      port: {
        creator: async () => {
          const next = stored.shift() ?? null
          return next === null ? null : toIdentityId(next)
        },
      },
      ids,
    })

    // The first call is made while creating a project; every later one reads
    // back what that project recorded.
    expect(await identity.identity()).toBe(toIdentityId(`idt_${ULID}`))
    expect(await identity.identity()).toBe(toIdentityId(`idt_${OTHER}`))
  })
})
