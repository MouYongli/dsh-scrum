/**
 * Installable bundle for the DeepSeek Harness: the node half of the plugin,
 * plus `cordis.patch.yml`, which the profile composer resolves through the
 * `dsh.bundle.patch` manifest field.
 *
 * The plugin itself lives in `@dsh-scrum/scrum-harness-host`; this package
 * re-exports it because a patch row's package name is resolved from the
 * profile directory, where only the installed bundle exists.
 *
 * @module @dsh-scrum/scrum-harness-bundle
 */
export { apply, inject, name } from '@dsh-scrum/scrum-harness-host'
