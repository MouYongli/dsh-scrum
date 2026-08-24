import { createElement, type ReactElement } from 'react'

/**
 * The shape of what is on its way.
 *
 * A line of text saying that something is being read tells somebody to wait
 * without telling them what for, and the page then jumps when one line of
 * placeholder is replaced by forty rows. Drawing the rows that are coming says
 * how much there is and where it will sit, so the arrival is a fill rather
 * than a reflow.
 *
 * A span rather than a div, so it can be dropped into the paragraph each
 * surface already renders without changing the element the tests select. The
 * caller keeps `role="status"` and the message on that paragraph; this is
 * hidden from the accessibility tree, because a row count is a picture of the
 * wait and not something worth reading out.
 */
export function LoadingSkeleton(props: { readonly rows: number }): ReactElement {
  return createElement(
    'span',
    { 'data-scrum-skeleton': props.rows, 'aria-hidden': true },
    Array.from({ length: props.rows }, (_, index) =>
      createElement('span', { key: index, 'data-scrum-skeleton-row': true }),
    ),
  )
}
