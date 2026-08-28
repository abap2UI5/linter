# Releasing

Two packages go to npm from **one** version tag:

| Package | What it is |
| --- | --- |
| `@abap2ui5/linter` | CLI, library and GitHub Action (~240 kB, no dependencies) |
| `@abap2ui5/render-runtime` | the UI5 runtime the render gate serves (`@openui5/*` + playwright) |

Everything mechanical lives in `.github/workflows/release.yml`; its header
comment is the reference. This file is the human checklist.

## The point of no return

A published npm version can **never** be replaced or re-used, and unpublishing
is only allowed within 72 hours (and only while nothing depends on it). So the
one irreversible act in this whole process is `npm publish`. Everything before
it is reversible: a branch, a tag, a GitHub release, even a wrong version in
`package.json` can be deleted, moved or corrected.

A mistake is therefore never fatal — it costs a version number. Publish
`0.1.0`, notice something is wrong, fix it, publish `0.1.1`. Nothing installed
breaks, because nobody can have installed the broken one yet.

## One-time setup

1. The npm organisation `abap2ui5` must exist and own the scope
   (npmjs.com → *Add Organization*, free for public packages). Without it every
   publish fails with a 404 on the scope.
2. The **first** publish of each package is manual, from a maintainer's
   machine — npm can only configure trusted publishing for a package that
   already exists:

   ```sh
   npm login
   npm publish -w @abap2ui5/render-runtime --access public
   npm publish --access public
   ```

   `--access public` because a scoped package is private by default. No
   `--provenance` here: npm only generates provenance from a supported CI and
   aborts anywhere else.
3. On npmjs.com → each package → *Settings* → *Trusted Publisher*: this
   repository, workflow file `release.yml`. From then on the workflow publishes
   with no token at all.

## Every release

```sh
# 1. Both versions in one bump - the workspace and the root have to agree
npm version patch|minor|major --workspaces --include-workspace-root --no-git-tag-version

# 1b. `npm version` moves versions and NO dependency range, so the optional
#     peer range on @abap2ui5/render-runtime has to follow. It is GENERATED:
npm run sync-peer-range
#     which writes ">=<floor> <next breaking runtime line>", e.g.
#       "peerDependencies": { "@abap2ui5/render-runtime": ">=0.1.0 <0.6.0" }
#     `npm test` fails while the committed range is not the generated one.
#     That gate exists because this step was missed for three releases running
#     while the range was a hand-extended union (`^0.1.0 || ^0.2.0 || ...`,
#     one clause per minor forever), and an out-of-range OPTIONAL peer is an
#     ERESOLVE error, not a warning: the matching pair was the one npm refused
#     to install.
#
#     Only the LOWER bound is a decision, and it lives in the script as FLOOR.
#     Raising it is an install failure for everyone still on that line, so it
#     is justified only by something the linter genuinely cannot work without -
#     not by the range looking untidy. (A missing `less-openui5` is NOT such a
#     reason: a screenshot then comes back unstyled and the gate does not care.)

# 1c. Moving to a new OpenUI5 release is THREE files, not one: the @openui5
#     pins in render-runtime/package.json, data/properties.json
#     (npm run generate-metadata) and data/icons.json
#     (npm run generate-icons, needs network). `npm test` fails while the
#     three disagree - the two data files answer `@since` from the version
#     they were generated at, and the render gate loads whatever the runtime
#     pins, so a half-moved release makes the two gates judge the same
#     control differently.

# 1d. Two generated artefacts carry the version, so they follow the bump:
#     data/abap2ui5lint.schema.json ($id names the tag, never main - an editor
#     must not validate a pinned config against rules main happens to hold)
#     and site/index.html (the page follows main while every consumer pins, so
#     it stamps the release it was generated from).
npm run generate-schema && npm run generate-rules-page
#     `npm test` fails while either is stale, so this cannot be forgotten -
#     but running it here keeps the release commit a single coherent diff.

# 2. Rename the CHANGELOG.md "Unreleased" heading to the new version, then
git commit -am "release vX.Y.Z" && git tag -a vX.Y.Z -m "release vX.Y.Z"
git push --follow-tags && git push origin vX.Y.Z
```

**Push the tag explicitly.** `--follow-tags` pushes *annotated* tags only, and
skips a lightweight one — the kind plain `git tag vX.Y.Z` creates — without
saying anything: the push reports `main -> main`, the release commit sits on
main with no tag behind it, and no release ever runs. `-a` and the second push
each fix that on their own; together they make it impossible to get wrong.

Afterwards, confirm the tag actually arrived:

```sh
git ls-remote --tags origin | grep vX.Y.Z
```

The tag push runs the release workflow: it re-runs the full test suite
(including the render half, so a published version is one that rendered),
packs both tarballs, installs the linter tarball in a clean directory and
smoke-tests it the way `npx` would, publishes runtime-then-linter, and then
moves the `v0` tag onto the release so `uses: abap2UI5/linter@v0` resolves and
writes the GitHub release, with the matching `CHANGELOG.md` section as its
notes.

Useful properties when something goes wrong:

- **Dry run.** *Actions → Publish to npm → Run workflow* does everything
  **except** the publish. Use it before the first real tag.
- **Re-runs are safe.** A version already on the registry is detected and its
  publish step is skipped, so a re-run finishes the rest instead of failing.
- **A wrong tag is not a release.** As long as the publish step has not run,
  `git push --delete origin vX.Y.Z` undoes it completely.
- **A red `after-publish` job does not undo a publish.** It runs after the
  packages are on npm and only maintains the `v0` alias and the GitHub release,
  so the fix is to repair those, not to re-release. By hand, the same call the
  alias step makes:

  ```sh
  gh api -X PATCH repos/abap2UI5/linter/git/refs/tags/v0 \
    -f sha="$(git rev-parse vX.Y.Z)" -F force=true
  ```

  Not `git push -f`: a push that moves a ref across workflow-file changes is
  refused outright, and for the workflow's own token that refusal cannot be
  waived — `workflows` is not a permission `GITHUB_TOKEN` can be granted.

- **The release notes come from `CHANGELOG.md`.** `after-publish` copies the
  section whose heading matches the tag, which is why step 2 renames
  `## Unreleased` to the version. A tag pushed without that rename still gets a
  release — pointing at the file rather than quoting it — and the run carries a
  warning saying so. Fix it by editing the release, not by re-tagging.

  Releases for `v0.1.0`–`v0.2.2` were written by hand on 2026-08-18, because
  this workflow made none before then: `releases/latest` answered 404 and the
  releases page showed only rolling `render-gate-bundle` prereleases.
