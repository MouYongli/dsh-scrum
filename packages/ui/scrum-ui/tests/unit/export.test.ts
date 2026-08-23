import { describe, expect, it } from 'vitest'
import { WORK_ITEM_RESOLUTION, WORK_ITEM_STATUS } from '@dsh-scrum/scrum-domain'
import { createTranslate, toCsv } from '@dsh-scrum/scrum-ui'
import { item } from '../support/items.js'

const t = createTranslate()

describe('exporting the table', () => {
  it('heads the file with the columns the table shows, in that order', () => {
    const [header] = toCsv([], t).split('\r\n')

    expect(header).toBe(
      [
        t('list.column.id'),
        t('list.column.title'),
        t('item.type'),
        t('item.category'),
        t('list.column.status'),
        t('item.priority'),
        t('list.column.assignee'),
        t('item.estimate'),
        t('list.column.sprint'),
        t('list.column.updated'),
      ].join(','),
    )
  })

  it('writes the rows it was handed, in the order it was handed them', () => {
    const csv = toCsv([item(2, { title: 'B' }), item(1, { title: 'A' })], t)

    // Narrowing and sorting happened before this: the file matches the screen
    // because the screen chose the rows.
    expect(
      csv
        .split('\r\n')
        .slice(1)
        .map((line) => line.split(',')[0]),
    ).toEqual(['SCR-2', 'SCR-1'])
  })

  it('quotes a title holding a comma or a quote, so one item stays one row', () => {
    const csv = toCsv([item(1, { title: '结算, 对账 "旧版"' })], t)

    expect(csv).toContain('"结算, 对账 ""旧版"""')
  })

  it('defuses a title a spreadsheet would run as a formula', () => {
    // A leading = makes the common spreadsheets evaluate the cell, which is a
    // well-known way of turning an exported list into something that executes.
    expect(toCsv([item(1, { title: '=1+1' })], t)).toContain("'=1+1")
  })

  it('spells the vocabulary the way the table does, not the way it is stored', () => {
    const csv = toCsv(
      [
        item(1, {
          status: WORK_ITEM_STATUS.done,
          resolution: WORK_ITEM_RESOLUTION.wontFix,
          estimate: null,
        }),
      ],
      t,
    )

    expect(csv).toContain(`${t('status.done')} · ${t('resolution.wontFix')}`)
    expect(csv).toContain(t('backlog.unestimated'))
    expect(csv).toContain(t('list.unassigned'))
  })
})
