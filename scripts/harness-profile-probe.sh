#!/usr/bin/env bash
# Installs the Scrum bundle into a throwaway DeepSeek Harness profile, checks
# that the profile composes its plugin rows, then uninstalls it and checks that
# nothing is left behind.
#
# The probe is not part of `pnpm test`: it needs the Harness CLI and a network
# install. Run it by hand when changing the bundle, the patch or the supported
# version range, and paste its output into the pull request.
#
#   scripts/harness-profile-probe.sh [dsh-version]
#
# Set DSH_BIN to use an already installed CLI instead of npx.
set -euo pipefail

DSH_VERSION="${1:-0.1.0-rc.7}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="$REPO_ROOT/packages/harness/scrum-harness-bundle"
BUNDLE_NAME="@dsh-scrum/scrum-harness-bundle"
PROFILE="scrum-probe"

DSH_HOME="$(mktemp -d)"
export DSH_HOME
trap 'rm -rf "$DSH_HOME"' EXIT

dsh() {
  if [ -n "${DSH_BIN:-}" ]; then
    "$DSH_BIN" "$@"
  else
    npx --yes "@deepseek-ai/dsh@$DSH_VERSION" "$@"
  fi
}

step() { printf '\n=== %s ===\n' "$1"; }

step "environment"
echo "DSH_HOME=$DSH_HOME"
echo "bundle=$BUNDLE_DIR"
dsh --help >/dev/null
echo "harness cli ${DSH_VERSION} responds"

step "install the bundle into a throwaway profile"
# The bundle is not published yet, so it is linked from the working tree; its
# workspace dependencies resolve through the repository's own node_modules.
dsh plugin --profile "$PROFILE" add "link:$BUNDLE_DIR"
dsh plugin --profile "$PROFILE" list 2>/dev/null || true

step "declare the bundle in the profile manifest"
node - "$DSH_HOME/profiles/$PROFILE/package.json" "$BUNDLE_NAME" <<'NODE'
const [file, bundle] = process.argv.slice(2)
const { readFileSync, writeFileSync } = await import('node:fs')
const manifest = JSON.parse(readFileSync(file, 'utf8'))
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
const bundles = manifest.dsh.profile.bundles ?? ['@deepseek-ai/dsh-base']
if (!bundles.includes(bundle)) bundles.push(bundle)
manifest.dsh.profile.bundles = bundles
writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
console.log('bundles:', bundles.join(', '))
NODE

step "composed configuration must contain both plugin rows"
dsh --profile "$PROFILE" --dump-config | tee "$DSH_HOME/composed.txt"
grep -q 'scrum-harness-host' "$DSH_HOME/composed.txt"
grep -q 'scrum-harness-client' "$DSH_HOME/composed.txt"
echo "both rows present"

step "uninstall"
# Uninstalling is the reverse of installing: drop the bundle from the profile's
# composition list, then remove the package.
node - "$DSH_HOME/profiles/$PROFILE/package.json" "$BUNDLE_NAME" <<'NODE'
const [file, bundle] = process.argv.slice(2)
const { readFileSync, writeFileSync } = await import('node:fs')
const manifest = JSON.parse(readFileSync(file, 'utf8'))
manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((name) => name !== bundle)
writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
console.log('bundles:', manifest.dsh.profile.bundles.join(', '))
NODE
dsh plugin --profile "$PROFILE" remove "$BUNDLE_NAME"

step "the profile must be back to where it started"
node - "$DSH_HOME/profiles/$PROFILE/package.json" "$BUNDLE_NAME" <<'NODE'
const [file, bundle] = process.argv.slice(2)
const { readFileSync } = await import('node:fs')
const manifest = JSON.parse(readFileSync(file, 'utf8'))
const dependencies = Object.keys(manifest.dependencies ?? {})
if (dependencies.includes(bundle)) throw new Error(`${bundle} is still a profile dependency`)
if ((manifest.dsh.profile.bundles ?? []).includes(bundle)) throw new Error(`${bundle} is still composed`)
console.log('profile dependencies:', dependencies.join(', ') || '(none)')
NODE
dsh --profile "$PROFILE" --dump-config > "$DSH_HOME/composed-after.txt"
if grep -q 'scrum-harness' "$DSH_HOME/composed-after.txt"; then
  echo "scrum rows are still composed after uninstall" >&2
  exit 1
fi
echo "no scrum rows remain in the composed profile"

step "result"
echo "install and uninstall probe passed against harness $DSH_VERSION"
