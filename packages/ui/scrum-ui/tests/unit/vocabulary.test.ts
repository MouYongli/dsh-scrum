import { describe, expect, it } from 'vitest'
import {
  BUG_SEVERITY,
  WORK_ITEM_CATEGORY,
  WORK_ITEM_RESOLUTION,
  WORK_ITEM_TYPE,
} from '@dsh-scrum/scrum-domain'
import {
  BUG_SEVERITIES,
  SCRUM_MESSAGES,
  WORK_ITEM_CATEGORIES,
  WORK_ITEM_RESOLUTIONS,
  categoryLabel,
  createTranslate,
  recommendedTypeFor,
  resolutionLabel,
  severityLabel,
} from '@dsh-scrum/scrum-ui'

describe('the new vocabularies', () => {
  it('offer every value the domain has, and no more', () => {
    expect([...WORK_ITEM_CATEGORIES].sort()).toEqual(Object.values(WORK_ITEM_CATEGORY).sort())
    expect([...WORK_ITEM_RESOLUTIONS].sort()).toEqual(Object.values(WORK_ITEM_RESOLUTION).sort())
    expect([...BUG_SEVERITIES].sort()).toEqual(Object.values(BUG_SEVERITY).sort())
  })

  it('name every value in both languages', () => {
    for (const locale of ['zh', 'en'] as const) {
      const t = createTranslate(locale)
      for (const category of WORK_ITEM_CATEGORIES) {
        expect(t(categoryLabel(category))).not.toBe(categoryLabel(category))
      }
      for (const resolution of WORK_ITEM_RESOLUTIONS) {
        expect(t(resolutionLabel(resolution))).not.toBe(resolutionLabel(resolution))
      }
      for (const severity of BUG_SEVERITIES) {
        expect(t(severityLabel(severity))).not.toBe(severityLabel(severity))
      }
    }
  })

  it('names unset rather than leaving it blank', () => {
    // A blank cell reads as a rendering fault; "unclassified" reads as a fact
    // about the item, which is what it is.
    expect(SCRUM_MESSAGES.zh[categoryLabel(null)]).toBe('未分类')
    expect(SCRUM_MESSAGES.zh[severityLabel(null)]).toBe('未判定')
  })

  it('suggests the type each category is usually filed as', () => {
    expect(recommendedTypeFor(WORK_ITEM_CATEGORY.feature)).toBe(WORK_ITEM_TYPE.story)
    expect(recommendedTypeFor(WORK_ITEM_CATEGORY.ops)).toBe(WORK_ITEM_TYPE.task)
    expect(recommendedTypeFor(WORK_ITEM_CATEGORY.defect)).toBe(WORK_ITEM_TYPE.bug)
  })
})
