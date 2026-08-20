#!/usr/bin/env node
/**
 * Mounts the working tree's Scrum bundle into a real DeepSeek Harness profile,
 * shows whether the profile composes it, and unmounts it again.
 *
 *   node scripts/dev-profile.js add | config | remove
 *
 * The profile defaults to `web`, the one `dsh web` boots; set DSH_PROFILE to
 * point the loop at a throwaway profile instead. Set DSH_BIN to use an
 * installed CLI rather than npx.
 *
 * This is not the throwaway-profile probe in harness-profile-probe.sh: that one
 * proves a clean install and uninstall in isolation, this one puts the bundle
 * in front of the Harness you actually run.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const BUNDLE_DIR = join(REPO_ROOT, 'packages', 'harness', 'scrum-harness-bundle')
const PROFILE = process.env['DSH_PROFILE'] ?? 'web'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const BUNDLE_NAME = readJson(join(BUNDLE_DIR, 'package.json')).name

/**
 * Harness version to run, taken from the declared peer range so that the loop
 * cannot drift from the supported range in the compatibility matrix.
 */
function harnessVersion() {
  const host = readJson(
    join(REPO_ROOT, 'packages', 'harness', 'scrum-harness-host', 'package.json'),
  )
  return host.peerDependencies['@deepseek-ai/dsh-base'].replace(/^[\^~]/, '')
}

/** Runs the Harness CLI, printing the command first so it can be pasted anywhere. */
function dsh(args, { capture = false } = {}) {
  const bin = process.env['DSH_BIN']
  const command = bin
    ? [bin, ...args]
    : ['npx', '--yes', `@deepseek-ai/dsh@${harnessVersion()}`, ...args]

  console.log(`$ ${command.join(' ')}`)
  const result = spawnSync(command[0], command.slice(1), {
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
  return result.stdout ?? ''
}

const actions = {
  // pnpm records an absolute path as a `link:` dependency, so editing sources
  // needs no reinstall; only a node-side change needs `pnpm build` and a
  // restart of the Harness.
  add: () => {
    dsh(['plugin', '--profile', PROFILE, 'add', BUNDLE_DIR])
    console.log(`\nmounted ${BUNDLE_NAME} in profile ${PROFILE}`)
  },

  config: () => {
    const composed = dsh(['--profile', PROFILE, '--dump-config'], { capture: true })
    const rows = composed
      .split('\n')
      .filter((line) => line.includes('scrum'))
      .join('\n')

    console.log(
      rows === '' ? `\n${BUNDLE_NAME} is not composed in profile ${PROFILE}` : `\n${rows}`,
    )
  },

  remove: () => {
    dsh(['plugin', '--profile', PROFILE, 'remove', BUNDLE_NAME])
    console.log(`\nunmounted ${BUNDLE_NAME} from profile ${PROFILE}`)
  },
}

const action = actions[process.argv[2]]
if (action === undefined) {
  console.error(`usage: node scripts/dev-profile.js ${Object.keys(actions).join(' | ')}`)
  process.exit(2)
}
action()
