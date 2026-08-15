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
smoke-tests it the way `npx` would, publishes runtime-then-linter, and finally
moves the `v0` tag onto the release so `uses: abap2UI5/linter@v0` resolves.

Useful properties when something goes wrong:

- **Dry run.** *Actions → Publish to npm → Run workflow* does everything
  **except** the publish. Use it before the first real tag.
- **Re-runs are safe.** A version already on the registry is detected and its
  publish step is skipped, so a re-run finishes the rest instead of failing.
- **A wrong tag is not a release.** As long as the publish step has not run,
  `git push --delete origin vX.Y.Z` undoes it completely.
- **A red `major-tag` job does not undo a publish.** It runs after the packages
  are on npm and only maintains the `v0` alias, so the fix is to move that
  alias, not to re-release. By hand, the same call the job makes:

  ```sh
  gh api -X PATCH repos/abap2UI5/linter/git/refs/tags/v0 \
    -f sha="$(git rev-parse vX.Y.Z)" -F force=true
  ```

  Not `git push -f`: a push that moves a ref across workflow-file changes is
  refused outright, and for the workflow's own token that refusal cannot be
  waived — `workflows` is not a permission `GITHUB_TOKEN` can be granted.
