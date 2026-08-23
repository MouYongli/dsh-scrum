import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoadingSkeleton } from '@dsh-scrum/scrum-ui'

describe('the loading skeleton', () => {
  it('draws one row per row it was asked for', () => {
    const markup = renderToStaticMarkup(createElement(LoadingSkeleton, { rows: 5 }))

    expect(markup.match(/data-scrum-skeleton-row/g)).toHaveLength(5)
    expect(markup).toContain('data-scrum-skeleton="5"')
  })

  /**
   * The message beside it is what a screen reader should hear. A count of
   * placeholder bars is a picture of the wait, and reading it out would say
   * nothing the message has not already said.
   */
  it('stays out of the accessibility tree', () => {
    const markup = renderToStaticMarkup(createElement(LoadingSkeleton, { rows: 2 }))

    expect(markup).toContain('aria-hidden="true"')
  })

  it('draws nothing when there is nothing to stand in for', () => {
    const markup = renderToStaticMarkup(createElement(LoadingSkeleton, { rows: 0 }))

    expect(markup).not.toContain('data-scrum-skeleton-row')
  })
})
