import { describe, expect, it } from 'vitest'
import { SCRUM_STYLES } from '../../src/client/styles.js'

/**
 * What this plugin assumes the Harness theme publishes.
 *
 * A `var()` naming a custom property that does not exist is not an error
 * anybody sees: it takes the fallback and the surface quietly stops tracking
 * the shell. That is how eight invented `--dsw-alias-*` names survived in this
 * sheet while it still read as though it were themed.
 *
 * The list cannot prove a name exists -- the theme is a transitive dependency
 * whose internals this package must not import -- so what it buys is that no
 * host token can enter the sheet without being written down here, which is the
 * point at which somebody has to go and check. Verified against
 * `@deepseek-ai/dsh-client-ui-theme@0.1.0-rc.8` when each was added:
 *
 *   grep -oh -- '--dsw-alias-bg-layer-1' \
 *     node_modules/.pnpm/@deepseek-ai+dsh-client-ui-theme@*\/node_modules/\
 *     @deepseek-ai/dsh-client-ui-theme/lib/*.js | wc -l
 */
const HOST_TOKENS: readonly string[] = [
  '--ds-ease-in-out',
  '--ds-transition-duration-fast',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-mask-1',
  '--dsw-alias-bg-module-platform',
  '--dsw-alias-bg-skeleton',
  '--dsw-alias-border-l2',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-label-secondary',
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-business-tertiary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
]

/** Every host custom property the sheet reads, deduplicated and sorted. */
function referenced(): string[] {
  const names = SCRUM_STYLES.match(/--ds[a-z]*-[a-z0-9-]+/g) ?? []
  return [...new Set(names)].sort()
}

describe('the host tokens the Scrum sheet depends on', () => {
  it('reads nothing this package has not declared', () => {
    expect(referenced().filter((name) => !HOST_TOKENS.includes(name))).toEqual([])
  })

  it('declares nothing the sheet has stopped reading', () => {
    const used = referenced()
    expect(HOST_TOKENS.filter((name) => !used.includes(name))).toEqual([])
  })

  /**
   * A shell composed without ui-theme resolves these to nothing, and a `var()`
   * with no fallback then makes the whole declaration invalid at computed-value
   * time -- the property lands on its inherited or initial value rather than on
   * anything this sheet chose. Every reference has to name what it degrades to.
   */
  it('gives every host token a fallback', () => {
    expect(SCRUM_STYLES.match(/var\(\s*--ds[a-z]*-[a-z0-9-]+\s*\)/g)).toBeNull()
  })
})
