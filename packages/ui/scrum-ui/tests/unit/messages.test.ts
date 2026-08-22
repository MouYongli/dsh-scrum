import { describe, expect, it } from 'vitest'
import { MESSAGE_KEYS, SCRUM_MESSAGES, createTranslate } from '@dsh-scrum/scrum-ui'

// The dictionaries themselves. `satisfies Record<Locale, Record<string, string>>`
// does not compare the two locales, and `createTranslate` falls back to the
// Chinese entry for a key the locale does not carry — so an entry added to one
// language and forgotten in the other reads as working, and shows Chinese in an
// English shell. That is a defect the type system cannot see and this can.

describe('the message dictionaries', () => {
  it('carry the same keys in both languages', () => {
    expect(Object.keys(SCRUM_MESSAGES.en).sort()).toEqual(Object.keys(SCRUM_MESSAGES.zh).sort())
  })

  it('answer every key with a sentence rather than an empty string', () => {
    for (const locale of ['zh', 'en'] as const) {
      const blank = MESSAGE_KEYS.filter((key) => SCRUM_MESSAGES[locale][key].trim() === '')

      expect(blank).toEqual([])
    }
  })

  it('answer an English shell in English', () => {
    const t = createTranslate('en')

    for (const key of MESSAGE_KEYS) {
      expect(t(key)).not.toMatch(/[一-鿿]/)
    }
  })
})
