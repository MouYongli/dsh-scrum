import type { WorkItem } from '@dsh-scrum/scrum-domain'
import { LIST_COLUMNS, LIST_COLUMN, type ListColumn } from './list.js'
import type { Translate } from './messages.js'
import {
  categoryLabel,
  priorityLabel,
  resolutionLabel,
  statusLabel,
  typeLabel,
} from './vocabulary.js'

/**
 * One cell, as the table draws it.
 *
 * The export is the table, not the stored record: somebody exporting what they
 * narrowed and sorted expects the file to hold what they were looking at. A
 * dump of raw fields would be a different document that happens to share a
 * button.
 */
function cell(item: WorkItem, column: ListColumn, t: Translate): string {
  switch (column) {
    case LIST_COLUMN.id:
      return item.id
    case LIST_COLUMN.title:
      return item.title
    case LIST_COLUMN.type:
      return t(typeLabel(item.type))
    case LIST_COLUMN.category:
      return t(categoryLabel(item.category))
    case LIST_COLUMN.status:
      return item.resolution === null
        ? t(statusLabel(item.status))
        : `${t(statusLabel(item.status))} · ${t(resolutionLabel(item.resolution))}`
    case LIST_COLUMN.priority:
      return t(priorityLabel(item.priority))
    case LIST_COLUMN.assignee:
      return item.assigneeId ?? t('list.unassigned')
    case LIST_COLUMN.estimate:
      return item.estimate === null ? t('backlog.unestimated') : String(item.estimate)
    case LIST_COLUMN.sprint:
      return item.sprintId ?? t('list.noSprint')
    case LIST_COLUMN.updated:
      return item.updatedAt
    case LIST_COLUMN.rank:
      return item.rank
  }
}

/**
 * Quoted whenever the value could be misread.
 *
 * Titles hold commas and newlines, and a spreadsheet reading an unquoted one
 * would silently split a work item across two columns. A leading `=`, `+`, `-`
 * or `@` is prefixed with a quote as well: those make a spreadsheet treat the
 * text as a formula, which is a well-known way of turning an exported list
 * into something that runs.
 */
function escape(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded
}

/**
 * The rows as CSV, in the column order the table uses.
 *
 * The caller hands over the rows it is showing — already narrowed and sorted —
 * so the file matches the screen without this having to know how either was
 * decided.
 */
export function toCsv(rows: readonly WorkItem[], t: Translate): string {
  const header = LIST_COLUMNS.map((column) => escape(t(column.label)))
  const lines = rows.map((item) =>
    LIST_COLUMNS.map((column) => escape(cell(item, column.column, t))).join(','),
  )
  return [header.join(','), ...lines].join('\r\n')
}

/**
 * Hands the file to the browser.
 *
 * Built here rather than fetched from the host: the data is already in this
 * page, and adding a host call that writes to the workspace would widen what
 * the browser may do for what is only a display action.
 *
 * A BOM, because the common spreadsheet on Windows reads a UTF-8 file without
 * one as the local code page and turns every Chinese title into mojibake.
 */
export function downloadCsv(fileName: string, csv: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return
  }
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
