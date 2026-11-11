# The render gate's package

The second published package, the peer split and the workspace. Read it before touching `linter-render/`, a peer range or the `@openui5` pins.

## `@abap2ui5/linter-render` — the second package, and why it exists

Two packages come out of this repository, from one tag:

| Package | What it is |
| --- | --- |
| `@abap2ui5/linter` | the CLI, `lib/`, `data/`, the typings. **Zero runtime dependencies**, ~600 kB |
| `@abap2ui5/linter-render` | the UI5 runtime the render gate serves: the eleven `@openui5/*` source packages, `less-openui5` and `playwright`, as one install (`linter-render/` — an npm **workspace** of this repo) |

**It was `@abap2ui5/render-runtime` up to 0.7.0.** Renamed because the name
read like the framework's runtime — `@abap2ui5/node-runtime`, abap2UI5
transpiled for Node, sits in the same scope. `lib/render.mjs` still resolves
the old name after the new one (`LEGACY_RENDER_RUNTIME`), and `package.json`
keeps it as an optional peer at a **frozen** range (`LEGACY` in
`scripts/peer-range.mjs`, checked by `npm test`), so a project that installed
it upgrades the linter without an ERESOLVE and without losing the render
gate. Nothing publishes the old name any more; RELEASING.md has the one-time
steps of the rename.

**The split is not tidiness, it is the advertised install.** The README's first
line is `npx @abap2ui5/linter src`, and the whole promise of it is that it is
fast. The `@openui5` packages weigh ~118 MB, and npm installs
`optionalDependencies` **by default** — so while they were declared that way,
that one line downloaded ~123 MB before it linted anything, and
`--omit=optional`, the documented way out, is not a flag `npx` accepts. An
**optional peer** is the one kind npm does not install on its own, which is
what the render runtime is now (`peerDependenciesMeta.optional`).

What follows from that, and each of these has bitten:

- **The `@openui5/*` pins live in `linter-render/package.json`**, not in the
  root manifest — `RELEASING.md` step 1c is the authority. Bumping a UI5
  release is three files: those pins, `data/properties.json`
  (`npm run generate-metadata`) and `data/icons.json`
  (`npm run generate-icons`, needs network). `npm test` fails while they
  disagree, through the snapshot-pairing assertion.
- **The peer RANGE is generated** (`npm run sync-peer-range`,
  `scripts/peer-range.mjs`). It used to be a hand-extended union
  (`^0.1.0 || ^0.2.0 || …`, one clause per minor) and the step was missed for
  three releases running. An out-of-range optional peer is an ERESOLVE
  **error**, not a warning: a stale range forbade exactly the pairing both
  READMEs tell people to install. Only the FLOOR is a judgement now, and it
  lives in the script.
- **A missing runtime is not a silent pass.** A default-on render gate whose
  runtime is absent steps aside for the property gate and says so on stderr
  (`renderFallback`); an **asked-for** gate (`--render`, or `"render": true` in
  the config) keeps the hard refusal. Naming the gate in the config is how a
  job promises it ran. A Chromium that will not start is the same case by
  another name (`ERR_RENDER_BROWSER_MISSING`): fallback where the gate was only
  left on, one sentence and exit 2 where it was asked for — never Playwright's
  banner, a stack trace and exit 1, which reads as "your views have findings".
- **Where the runtime is looked for** (`runtimeRequire` in `lib/render.mjs`):
  next to the linter, then in the project the run starts in
  (`process.cwd( )`) — `npx --yes @abap2ui5/linter` and a global install live
  nowhere near the project's `node_modules`. Every `@openui5` package is then
  resolved **on its own** (`libRoots`): under pnpm each sits in a store
  directory of its own, and serving "the folder sap.ui.core is in" served
  sap.ui.core alone and hung the gate. Both waits are bounded
  (`bootTimeout`/`renderTimeout` on `openRenderer`), so a runtime that cannot
  boot is an error, not a hang. A runtime of another UI5 minor than the
  snapshot is named on stderr (`runtimeSnapshotMismatch`).
- The composite Action installs the workspace or not, by input:
  `npm ci --prefix "$ACTION_PATH"` with `render: true`,
  `--workspaces=false` with `render: false`. That is what makes a
  property-only job skip the download rather than pay it and then pass
  `--no-render`.
- `.github/scripts/substitute-linter.sh` deliberately does **not** copy the
  runtime into a consumer: it comes from the consumer's own install and stays
  hoisted at its top level.
