# Release model

How a change reaches each channel. `RELEASING.md` has the procedure; this is the reasoning.

## Release model — merging to main IS a release, except on npm

- **Merging to main is the release for every channel but one.** The rules page,
  the render-gate bundle and the SHA pins downstream all follow main. npm is
  the exception: a published version is immutable and `npm i @abap2ui5/linter`
  has to keep meaning one thing, so it needs a deliberate version tag.
- **npm — `.github/workflows/release.yml`, triggered by a `v*` tag.**
  `npm version patch|minor|major && git push --follow-tags` is the whole
  procedure. The job refuses to publish when the tag and `package.json`
  disagree (a burned version number cannot be reused), reruns the full suite
  including the render half on the exact commit, packs the tarball and
  installs it into a scratch directory to prove the `files` allowlist did not
  drop a `lib/` or `data/` file. Dispatching the workflow by hand runs all of
  that and stops short of the publish.
  - Publishing uses **trusted publishing (OIDC)**, so there is no `NPM_TOKEN`
    to leak or rotate and npm attaches a provenance attestation. Two manual
    steps precede the first automated release, in this order: the npm
    organisation **`abap2ui5` must exist** (the scope is unclaimed — every
    publish 404s until it does), and trusted publishing can only be configured
    on a package that already exists, so the **first publish is manual**
    (`npm publish --access public --provenance`) and the trusted publisher is
    pointed at `release.yml` afterwards.
  - Stay in **`0.x`** while the rule set is still growing: it says out loud
    that a new rule may change a consumer's verdict, which is exactly what
    happens on most merges here.
  - The same tag also serves **the Action in this repo**: a second job
    force-moves the major tag (`v0`, `v1` later) onto the release commit, so
    `uses: abap2UI5/linter@v0` is the documented pin instead of the
    unpinnable `@main`. Only the alias moves — `v0.1.0` stays put for anyone
    who needs a build to stay reproducible. That job is separate so the
    publish job keeps `contents: read`.
  - A tagged release is also the **prerequisite for the GitHub Marketplace
    listing** (the Action needs a release to be published from; `action.yml`
    already carries the required `branding`). Marketplace publishing itself
    is a click-through on the release, not a workflow step.
  - `action.yml` is **not** in `files[]`: a composite action runs from the
    checkout (`github.action_path`), never from a consumer's `node_modules`,
    so shipping it on npm only made the tarball describe a channel it cannot
    serve. `scripts/generate-metadata.mjs` stays in `files[]` on purpose —
    see the metadata section above: samples-controls runs it out of
    `node_modules`.
