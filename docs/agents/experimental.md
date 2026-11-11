# `experimental/` — spikes, not channels

Two prototypes kept as documentation that executes. Neither is shipped or supported.

## `experimental/github-app/` — a spike, not a channel

`experimental/github-app/` is a working prototype of the linter as a hosted
**GitHub App** (webhook → installation token → property gate → check run),
written to answer
"what would this take" with running code. **It is not deployed, not registered
and not part of any release** — the npm `files` allowlist excludes it, so it
never reaches the package. Treat it as documentation that happens to execute.

- It runs the **property gate only**, and that is the load-bearing decision:
  `checkAbapSource`/`checkXmlSource` take source rather than a checkout, so a
  delivery is linted in memory with no clone and no temp directory. The render
  gate needs Chromium plus ~140 MB of `@openui5/*` per run and stays in the
  consumer's CI. It is the same split the VS Code extension already lives on.
- `node experimental/github-app/dryrun.mjs <path>` runs the identical
  `lintSource`/`toAnnotations`/`summarize` path against local files and prints
  the check-run payload — the only part testable without registering an App.
- Its README lists what separates the prototype from a service (persistence,
  rate limits, installation lifecycle, operations). That list, not the code,
  is why this is a spike: the missing work is ongoing, not one-time.
- **The two pinned consumers no longer pin the same way.** samples-controls
  moved to an **npm range** (`^0.8.3` as of 2026-09; its `bump_linter.yaml` raises it) and lets `package-lock.json` decide which
  published version its gates actually run, bumped weekly to `latest` by its
  own `bump_linter.yaml` (which runs the full strict view gates over the 416
  ports before the PR exists). The VS Code extension pins an EXACT published
  version (`"@abap2ui5/linter": "0.8.5"`, since its 0.30.2 - before that a
  `github:abap2UI5/linter#<sha>`), moved by its own `bump-linter.yml`. Either way the
  downstream workflow is what says a bump is safe. npm additionally serves the
  consumers that have no such workflow — a developer linting their own app,
  and anyone who wants a pinnable version instead of `@main`.
- **The README's "Used by" list is ours; GitHub's sidebar panel is not going
  to appear.** That panel — the one abaplint has — shows only once the selected
  package has **100 dependents**. It is a threshold, not a setting: the package
  is published, its `repository` field resolves back here, the dependency graph
  is on and the dependents ARE indexed (they are listed at
  https://github.com/abap2UI5/linter/network/dependents), so there is nothing
  to enable and nothing to fix. Do not go looking for the setting again. The
  only lever is the number, and the one thing that moves it is a **manifest
  entry**: `npx --yes @abap2ui5/linter` and the composite Action are invisible
  to the dependency graph, so a repo using the linter either way is a user but
  never a dependent — a consumer that wants to count runs `npm i -D` and
  commits the lockfile. `scripts/generate-dependents.mjs` renders the same list
  into README.md between the `dependents:start`/`:end` markers, refreshed
  monthly by `.github/workflows/refresh-dependents.yml`. There is no API for
  the page, so it is scraped and its markup is the contract: an empty parse
  exits 1 instead of publishing "0 repositories", and `npm test` pins the
  parser against `test/fixtures/dependents-page.html` — a saved copy of that
  page, which is what to update when GitHub moves the markup.
- **`site/index.html` is published on merge** to
  https://abap2ui5.github.io/linter/ by `.github/workflows/pages.yml` — a
  reworded rule detail is live the moment it lands on main. The workflow only
  serves the committed file, it never regenerates it: a generator running in
  CI would paper over a stale commit instead of failing on it. Pages has to be
  enabled once in the repository settings, source "GitHub Actions".
- **It is a deployment like the other three, and its head now says so.** It
  had no canonical url, no Open Graph or Twitter card, no favicon, no
  theme-colour and no ld+json — shared to Slack it was a bare link, and its tab
  wore the browser's default icon. It carries all of them now; the icon and the
  card image are the **playground's**, because one origin serves all four and
  this deployment publishes a single file (`pages.yml`, `path: site`), so a
  copy here would be a second thing to keep in step for no gain.
- **372 things on this page take focus**, every rule id and every playground
  link among them. Reaching the rules from the keyboard meant tabbing past all
  of them, so the first stop in the body is a skip link — visible only while it
  holds focus — and the cards sit in a `<main id="rules">` that had no landmark
  at all before. The filter has a real `<label>` too: a placeholder names a
  field until the first keystroke and a screen reader read the page's one
  control as an unnamed search box.
- **The page is read on a phone, and its prose is full of unbreakable
  identifiers.** `mEventRegistry`, `addCustomCurrencies`,
  `sap.ui.unified.RecurringCalendarAppointment` — a UI5 name has no hyphen or
  space to break at, so a single one in inline `<code>` used to push the whole
  document wider than the screen (measured 185px past a 320px viewport, 115px
  past 390px) and every line of prose scrolled sideways with it. The stylesheet
  gives inline code `overflow-wrap: anywhere` and takes it back for `pre code`,
  where the block scrolls on its own and a line broken mid-identifier stops
  being code anyone can copy. `npm test` gates both halves.
- `.github/workflows/bundle.yml` maintains the rolling prerelease tag
  **`render-gate-bundle`** with `view-check-bundle.tgz` (cli + lib + data +
  prod node_modules). **Installed VS Code extensions download this bundle at
  runtime** (`vscode-extension/src/rendergate.ts`) — merging a change to
  `cli.mjs`, `lib/`, `data/` or `package.json` silently updates what every
  installed extension fetches next. There is no version negotiation; treat
  `lib/` layout and CLI flags as a public contract. The **`--json` shape is
  part of that contract** — it may grow keys (`problems` was added that way),
  never lose or rename them. The human `stylish` output is not: it is for
  people, and it changed shape once already.
- The VS Code extension additionally records the **release commit** of the
  linter version it bundles (`linterRelease` in its `package.json`) to pick
  the matching `render-gate-bundle-<sha12>` — a new finding type is invisible
  in the editor until that pin is bumped there.
- **`abap2ui5lint.jsonc` is honoured by the CLI, the Action AND the VS Code
  extension** — the extension discovers it via `findConfigFrom`/`loadConfig`
  from `@abap2ui5/linter/config` and lets it beat the VS Code settings
  ("that is what CI checks against", its `src/lintconfig.ts`). The editor/CI
  divergence this bullet used to describe is closed; keep the config loader
  backward compatible, three consumers read it now.

## `experimental/evals/` — what a model writes, measured

`frozen-view-builder` is a rule here because the public web taught
`z2ui5_cl_xml_view`: a model asked for an app answers from that, in an API that
is no longer the one to use. The documentation's AI page, the framework's
`AGENTS.md` and `llms.txt`, the plugin and the MCP server exist to correct it.
Whether they do is a **number**, and `experimental/evals/` is where it is
produced — twelve prompts phrased the way a user asks, answered in a fresh
model session with nothing in the context, scored by this checkout's CLI.

- `node experimental/evals/score.mjs --prompts` prints the pack. Answers are
  saved as `<prompt-id>.clas.abap`; `score.mjs <dir> --label <run>` reports the
  headline rows — current builder, frozen builder, no view built, not an app
  class, clean — plus findings grouped by `CATEGORIES` with the taxonomy's own
  titles, so a rule or category added in `lib/rule-docs.mjs` appears there
  without this directory being touched. `--json-out` keeps a run comparable,
  `--render` answers whether the view loads rather than whether it names real
  controls.
- It calls **no model**: no keys, no vendor list, no per-run cost that would
  keep it out of reach, and no claim here about which models matter next month.
  The harness is the artefact; the answers are data.
- The run uses the linter's **defaults** (1.71, fail on warning, distribution
  unset) deliberately: that is the verdict a consumer gets with no
  configuration, which is where the measured code would land.
- **Not in `npm test`**, not in any release, excluded from the npm `files`
  allowlist — the same standing as `github-app/`, and for a sharper reason: a
  scoring run needs answers, which CI does not have.
- A session that has already read abap2UI5 documentation — including an agent
  working in this repository — is contaminated and cannot produce a baseline.
  `experimental/evals/README.md` says what the numbers do and do not mean
  before anyone quotes one.
