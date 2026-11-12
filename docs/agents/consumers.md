# Consumers — who reads this package, and what they are owed

The repositories that depend on the linter and the contract a change has to keep with them. Read it before changing a severity, a finding type, the reconstructor or an export.

## Relation to samples-controls — this repo is canonical now

> **One name, three spellings in the history.** The corpus repository is
> `abap2UI5/samples-controls`; it was `abap2UI5-api` before that and
> `ai-demokit` before that. It is referred to by its current name throughout
> this file, including where the events described predate a rename — older
> commit messages and PR titles still carry the old ones.

samples-controls's ancestor scripts (`property-check.mjs`, `structure-lint.mjs`,
`render-smoke.mjs`) were **deleted** when its gates were consolidated onto
this linter: samples-controls consumes `@abap2ui5/linter` from npm (a caret
range, resolved by its lockfile) and keeps only the corpus policy in its `scripts/view-gates.mjs` (which
ports, POST_171 deviations, declared skips, advisories). Rules of thumb:

- **All generic view-checking logic lives here**; samples-controls-specific gate
  policy (sidecar deviations, corpus conventions) stays in `view-gates.mjs`.
- A behaviour change here changes samples-controls's CI verdicts on the next
  dependency bump. **`.github/workflows/downstream.yml` runs that check for
  you** on every push and PR — see below; you no longer have to remember to
  run the corpus by hand.
- **No consumer follows main.** samples-controls takes this repo from npm
  (`"@abap2ui5/linter": "^0.8.3"` at the time of writing, resolved by its `package-lock.json`, moved
  to the latest published version weekly by its `bump_linter.yaml`); the VS
  Code extension pins an **exact published version** plus its release commit
  (`linterRelease`); mcp-server declares a peer range on the published minor
  and imports a checkout beside it first. So a
  merge here reaches nobody on its own except an mcp-server developer: for the
  other two, moving the pin is a deliberate change in the consumer, and the
  downstream workflow is what says whether that move is safe. A pin pointing
  at a **feature branch** of this repo is only ever temporary — it must become
  a SHA on main (or a published version) before that consumer's change is
  merged.

## A consumer that cannot hand us a path

`checkAbapSource` / `checkXmlSource` are the whole API for a consumer that has
a filesystem: hand them a source and, if the default snapshot is not right, a
`snapshot` PATH. Two consumers cannot do that, and both are ours:

- the **VS Code extension** runs the property gate in-process in two hosts. On
  the desktop it reads the snapshot from a file next to its own bundle; in the
  browser host (vscode.dev, browser BAS) there is no `fs` at all and the
  snapshot arrives as TEXT through `workspace.fs`. A path-only option cannot
  express that, so the extension assembles the pipeline itself out of the
  subpath exports.
- **mcp-server** does the same for the pieces it exposes as tools.

That is why the low-level pieces are exported at all, and it is a real
contract, not a convenience: **anything an entry point calls to produce a
finding has to be reachable on its own, or a consumer assembling the pipeline
silently loses that rule.** It happened: `checkIcons` lived in a module the
exports map did not name, `exports` blocks a deep import, and the extension's
XML path therefore had no icon rules while its ABAP path (which goes through
`checkAbapRules`) had them — the same file judged differently by the editor
and by CI, which is the divergence that gate exists to close. `./icons` is the
fix.

So when a new check is added to `checkAbapSource` or `checkXmlSource`, ask
whether a consumer can reach it without them. If not, export the module the
same way — the typings gate in `npm test` then requires a `declare module`
block for it, and `downstream.yml`'s extension typecheck proves the shape
against a real consumer.

**Reachable means reachable from a BROWSER bundle, not just importable.**
`lib/index.mjs` imports `render.mjs`, which imports `http`, `os` and
`module` at load time. Anything only that entry point exports is therefore
unreachable for the VS Code extension's web build: esbuild cannot resolve
those for `platform: browser` and the build fails outright. That is how
`elementBoundSlots` — which `checkAbapSource` uses to decide `boundElement`,
and which SUPPRESSES the relative-binding findings — came to be unreachable,
leaving a consumer stricter than the CLI and reporting a false positive it
had no way to avoid. It lives in `lib/abap-source.mjs` now and is re-exported
from `./abap-rules` (which no renderer hangs off) as well as from the entry
point. A helper a consumer needs belongs in a leaf module; a test asserts
that neither of those two reaches `render.mjs` or `index.mjs`.

**`./check` is the entry point without the renderer.** `checkAbapSource( )`
and `checkXmlSource( )` live in `lib/check.mjs` with every decision they
make on the way (`declaresApp`, `VIEWLESS_APP_RULE`, `sizeLimitRaised`,
`standDownUnusedNamespaces`, `frozenBuilderOf`, `xmlFileKind`); `index.mjs`
re-exports them unchanged and keeps `checkFiles( )`, the worker pool and the
renderer. Both take the snapshot as data (`data`, from
`snapshotFromJson( )` on `./properties`) and a reconstruction the caller
already has (`prep`), so a host without a file system can call the real
entry points instead of re-assembling them - the VS Code extension carried
a port of each of those decisions, pinned to this source by a test of its
own. A decision `checkAbapSource( )` makes belongs in `check.mjs` as an
export, not inline: an inline one is a decision every pipeline-assembling
consumer has to copy. `check-entry-point.mjs` loads `./check` in a fresh
process with a resolve hook and fails on `render.mjs`, `index.mjs`, a
`worker_threads`/`http`/`os`/`module` import or anything of the render
runtime, and walks the static import graph as well.

## The downstream contract — `.github/workflows/downstream.yml`

`npm test` only ever proves this linter against its own fixtures. The
downstream workflow proves it against the repos that actually consume it,
with **this checkout substituted for the SHA they pin**
(`.github/scripts/substitute-linter.sh` copies the published `files[]` over
`node_modules/@abap2ui5/linter`; the linter's own runtime deps stay hoisted in
the consumer, so no second install is needed):

| Job | What it catches |
| --- | --- |
| `samples-controls corpus` | a rule that starts firing on real ports — run through `view-gates.mjs`, so corpus policy (POST_171 deviations, declared skips, advisories) applies and only a genuine regression fails |
| `app-corpora` | the property gate straight over samples, samples-stack, app-template, abap2UI5's own apps and the seven addons that declare the linter, each with its own committed config — advisory, so it prints the per-rule count into the job summary rather than gating; the number a rollout note quotes |
| `vscode-extension typecheck` | a renamed or reshaped export — the extension imports the subpath exports and typechecks them against the typings this package ships, which nothing here would otherwise exercise |

A red downstream job is **not automatically a defect in the change**: a new
rule that fires on the corpus may well be right. It means the rollout has to
be decided — severity, an advisory period, or a corpus fix — rather than
landing unseen. Two traps worth knowing before reading a result:

- **Severity is not the whole story.** `view-gates.mjs` neutralises some rules
  by *type* (`ADVISORY_TYPES`), so raising one of those from `hint` to `error`
  changes nothing downstream. Conversely a **renamed rule id** is a silent
  breaking change: the consumer matches `VERSION_TYPES` and its sidecar
  deviations by type name, so a rename un-excuses every finding that name
  covered (renaming `member-too-new` fails 68 ports). Since 2026-11 a rename
  is an entry in `lib/rule-aliases.mjs`: the old id keeps working for one
  minor line in a config `rules` block, a directive and a baseline key -
  but a consumer's OWN tables (`VERSION_TYPES`, sidecar deviations) still
  match the new name only, so the rename stays a "Read before upgrading"
  item.
- The corpus exercises only a fraction of the rule set — when this was last
  measured (2026-08, 416 ports) just six finding types fired across the whole
  corpus. A green corpus job means *no regression*, not *the new rule is
  covered*. The current size is in samples-controls' generated `STATUS.md`;
  quoting it here as a standing number is how this line came to say 280.

## Related repositories

| Repository | Relation |
| --- | --- |
| [samples-controls](https://github.com/abap2UI5/samples-controls) | Origin of the gate logic; now consumes this package via `scripts/view-gates.mjs` (npm dependency, a caret range) |
| [mcp-server](https://github.com/abap2UI5/mcp-server) | `validate_view` imports the linter **through the package exports map** (its `importViewCheck` resolves `.` and the subpaths) — a removed or renamed `exports` entry breaks it; the file layout under `lib/` is free to move as long as `exports` stays intact |
| [vscode-extension](https://github.com/abap2UI5/vscode-extension) | Consumes the SHA-pinned package (property gate) and the runtime `render-gate-bundle` download |
| [abap2UI5](https://github.com/abap2UI5/abap2UI5) | Defines `z2ui5_cl_ui5_view_builder`, the builder whose chains `lib/reconstruct.mjs` re-executes |
