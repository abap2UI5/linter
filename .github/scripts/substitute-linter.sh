#!/usr/bin/env bash
#
# substitute-linter.sh <linter-checkout> <consumer-checkout>
#
# Replaces the linter a consumer installed from its pinned commit with the
# working copy in <linter-checkout>, so the downstream workflow tests the
# PROPOSED linter rather than the pinned one.
#
# Only the files the package actually publishes are copied - the `files` list
# in package.json is read rather than restated here, so adding a published
# directory cannot silently leave this script behind. The consumer's install is
# otherwise untouched, and a plain file copy is enough because the linter has no
# runtime dependencies of its own to reconcile.
#
# The UI5 runtime (@openui5/*, playwright) is deliberately NOT copied: it ships
# in @abap2ui5/render-runtime, an optional peer, so it comes from the consumer's
# own install and stays hoisted at its top level. A consumer that has it keeps
# rendering; one that does not gets the linter's actionable refusal naming that
# package, rather than a silently weakened gate.
set -euo pipefail

# Absolute, because `require()` reads a bare relative path as a module name.
LINTER=$(cd "${1:?usage: substitute-linter.sh <linter-checkout> <consumer-checkout>}" && pwd)
CONSUMER=$(cd "${2:?usage: substitute-linter.sh <linter-checkout> <consumer-checkout>}" && pwd)

TARGET="$CONSUMER/node_modules/@abap2ui5/linter"

if [ ! -d "$TARGET" ]; then
  echo "::error::$TARGET does not exist - did the consumer's install run, and does it still depend on @abap2ui5/linter?"
  exit 1
fi

PINNED=$(node -p "
  try { require('$CONSUMER/package-lock.json').packages['node_modules/@abap2ui5/linter'].resolved }
  catch { 'unknown' }
")
echo "consumer pins: $PINNED"
echo "substituting:  $(git -C "$LINTER" rev-parse HEAD)"

# Does the consumer's DECLARED range still admit the version this repository
# releases?
#
# The line above prints the resolved URL, which says what the consumer
# installed and nothing about what it is willing to install. That gap is how
# the documentation came to claim samples-controls pins "^0.2.1" while this
# repository sits at 0.5.1 - a range under which the substituted linter could
# never have been installed at all. The substitution itself works either way
# (files are copied over an existing tree), so this job would go on proving a
# pairing npm would refuse.
#
# A note, not a failure: which side is stale is a judgement (the consumer may
# be deliberately held back), and this script's job is to substitute, not to
# arbitrate. The line is what makes the answer visible.
DECLARED=$(node -p "
  const p = require('$CONSUMER/package.json');
  (p.dependencies || {})['@abap2ui5/linter']
    || (p.devDependencies || {})['@abap2ui5/linter']
    || '';
")
VERSION=$(node -p "require('$LINTER/package.json').version")
if [ -n "$DECLARED" ]; then
  echo "consumer declares: $DECLARED (this repository is $VERSION)"
  case "$DECLARED" in
    github:*|git+*|file:*|link:*|workspace:*)
      echo "note: '$DECLARED' is not a semver range - nothing to compare"
      ;;
    *)
      if node "$LINTER/scripts/peer-range.mjs" --satisfies "$DECLARED" "$VERSION" >/dev/null 2>&1; then
        echo "range check: '$DECLARED' admits $VERSION"
      else
        echo "::warning::the consumer declares '@abap2ui5/linter': '$DECLARED', which does NOT admit this repository's $VERSION - npm could not install the pairing this job is proving. One of the two is stale: either the consumer's range needs raising, or the documentation here still quotes an old one."
      fi
      ;;
  esac
else
  echo "consumer declares no @abap2ui5/linter range (a transitive or workspace install)"
fi

# package.json comes along so the `exports` map and `bin` entries stay right.
FILES=$(node -p "
  const p = require('$LINTER/package.json');
  [...new Set([...(p.files || []), 'package.json'])].join('\n');
")

rm -rf "$TARGET"
mkdir -p "$TARGET"
while IFS= read -r entry; do
  [ -z "$entry" ] && continue
  entry=${entry%/}
  if [ -e "$LINTER/$entry" ]; then
    # Copy to the SAME relative path: a files[] entry may name a file inside a
    # directory ("scripts/generate-metadata.mjs"), which a copy into $TARGET/
    # would flatten into the package root.
    mkdir -p "$(dirname "$TARGET/$entry")"
    cp -R "$LINTER/$entry" "$TARGET/$entry"
  else
    echo "note: '$entry' is listed in files[] but absent from the checkout - skipped"
  fi
done <<< "$FILES"

# Prove the substitution took rather than trusting the copy: the entry point
# the consumer imports has to be byte-identical to this checkout's.
for f in lib/index.mjs data/properties.json; do
  if ! cmp -s "$LINTER/$f" "$TARGET/$f"; then
    echo "::error::$f in $TARGET does not match $LINTER - the substitution did not take"
    exit 1
  fi
done

echo "substituted linter in place: $TARGET"
