# AGENTS.md — abap2UI5 linter

Single source of truth for agents working on the **abap2UI5 view linter** —
the standalone property + render gates for abap2UI5 views (classes built with
`z2ui5_cl_ui5_view_builder`, and `*.view.xml`/`*.fragment.xml`), usable as
CLI, library and GitHub Action, no SAP system required.

> This entire project is in **English**. Plain ESM JavaScript, Node >= 22,
> no TypeScript, no build step, no formatter — do not add any of those.

### Where knowledge lives

This file is read at the start of **every** session (`CLAUDE.md` points at
it), so what it costs is paid on every task. It holds what you must know
*before* you can know you need to look something up: the commands, the rules
that are easy to break without noticing, and where the rest is. It was 156 kB
once, most of it the history of individual rules; `npm test` now holds it to a
budget (`AGENTS_BUDGET` in `test/sections/artefacts.mjs`), so new knowledge goes where the
table below says, not here.

| Kind of knowledge | Where it belongs |
| --- | --- |
| A constraint on one function or rule | A comment at that code |
| What a rule means, for its user | The rule's card (`detail`, `example`, `remedy`) — `--explain` and the rule page print it |
| A rule that can be checked | A section in the suite. Prose is a request; a gate is a guarantee |
| Why a rule is shaped the way it is, what it was measured on | `docs/agents/rule-history.md`, or `CHANGELOG.md` for one change |
| A rule not built yet | `docs/agents/roadmap.md` |
| A prohibition you would otherwise violate unknowingly | Here, in one line |

| File | Read it when |
| --- | --- |
| `docs/agents/scope.md` | touching `lib/reconstruct.mjs`, file collection, the derived model or the start path — what the linter can and cannot see |
| `docs/agents/rule-map.md` | you need to find a rule: every id with severity, category, fix, opt-in and the file it is defined in (**generated**) |
| `docs/agents/rule-modules.md` | working inside a module of `lib/` — what each one is for, the hand-maintained knowledge files, fixes, `dedupe`, the test layout in full |
| `docs/agents/roadmap.md` | adding a rule — the open candidates and the rules of the trade (measure on the corpora, check it can see anything) |
| `docs/agents/rule-history.md` | widening or narrowing a rule — where it came from and what it was measured against |
| `docs/agents/output.md` | changing a formatter, a flag, the run summary, progress or a badge — the surface shared with ui5lint and abaplint |
| `docs/agents/data.md` | anything under `data/` — the metadata snapshot, `compat.json`, the abap2UI5 manifest, the portable profile |
| `docs/agents/render-package.md` | `linter-render/`, a peer range, the `@openui5` pins |
| `docs/agents/consumers.md` | changing a severity, a finding type, the reconstructor or an export — who depends on it, and the downstream contract |
| `docs/agents/release.md` | versioning or publishing (procedure: `RELEASING.md`) |
| `docs/agents/experimental.md` | `experimental/` — the GitHub App spike and the evals |

## Build & verify

```bash
npm ci
npx playwright install chromium   # BEFORE npm test - the first test uses the render gate
npm run check                     # npm test + the github-app dry run: the two CI
                                  # jobs a pull request has to pass on a plain checkout
npm run test:static               # the suite WITHOUT the render gate and without a browser:
                                  # every section not written `section.browser( )`, about
                                  # half the time. Needs no playwright install - the loop
                                  # for rule and reconstructor work (test/static.mjs;
                                  # -- --test-name-pattern=fix narrows it)
npm test                          # node --test test/run.mjs: node:test, over 1000 assertions
                                  # in ~500 isolated sections (test/sections/ + test/review/,
                                  # loaded at the end). One of them:
                                  #   node --test-name-pattern=fix test/run.mjs
npm run generate-schema           # after adding a rule - the test gates the drift
npm run generate-rules-page       # ditto: site/index.html, the published reference
npm run sync-portable-profile     # data/portable-v1.json - abap2UI5/protocol's portable
                                  # profile, copied verbatim (-- --local <protocol checkout>,
                                  # -- --check compares only); npm test pins its hash
npm run sync-manifest             # data/abap2ui5-manifest.json - abap2UI5's own manifest of
                                  # the sets mirrored in lib/ (-- --local <abap2UI5 checkout>,
                                  # -- --check compares only); npm test holds the mirrors to it
npm run generate-compat           # data/compat.json - after a version bump, or with
                                  # -- --local <abap2UI5 checkout> after a mirror sync
npm run generate-abap2ui5-since  # data/abap2ui5-since.json + lib/abap2ui5-since.mjs -
                                  # NEEDS NETWORK (abap2UI5's release tags); -- --module
                                  # rewrites the module from the committed data file
npm run fix-coverage -- <path>    # findings per rule over a corpus, and how many carry a fix
node scripts/generate-icons.mjs   # data/icons.json - NEEDS NETWORK (packs 81
                                  # OpenUI5 minors), so it is not in npm test:
                                  # the committed file is the contract
npm run generate-dependents       # the README "Used by" list - NEEDS NETWORK
                                  # too (GitHub's dependents page), same deal:
                                  # monthly workflow, committed block is truth
node cli.mjs <files> --no-render  # fast property-gate-only loop while iterating
                                  # (--jobs 1 for one thread, e.g. to profile)
node cli.mjs src --watch          # the same, re-run on every save (Eclipse ADT + abapGit
                                  # developers have no editor linter; this is their loop)
# settings can be pinned in the checked repo's abap2ui5lint.jsonc (lib/config.mjs;
# CLI flag > config > default; unknown keys and unknown rule ids fail loudly)
```

`npm test` fails with an unhelpful Chromium error after a bare `npm ci` —
the playwright install is mandatory for it, not optional. `npm run
test:static` is the half that needs none: a section that drives the render
gate is written `section.browser( name, body )` and skipped there, and
Chromium is refused outright in that mode (`ABAP2UI5LINT_NO_BROWSER=1`,
`launchBrowser( )` in `lib/render.mjs`), so a render test that is not marked
fails it — CI runs the static half before the browser is installed. Mark a
new section that renders; split a long one whose render part is a few lines,
so the rest keeps running in the static half. CI
(`.github/workflows/ci.yml`) runs exactly these steps on Node 22.

`npm run check` is the entry point CONVENTIONS section 3 asks every repository
for, and it names what it leaves out: `codeql`, the `action` job (it runs the
composite action, which does its own `npm ci` into a separate tree) and
`package` (an `npm audit` of the published dependency set plus a tarball
export check — both facts about a *publish*, not about a checkout). Everything
else a pull request must pass is in it. It ran `node cli.mjs` until
2026-08-28, which lints `src` — a directory this repository does not have, so
the one command an outside developer types first answered `no such file or
directory`.

Changing a **severity, a finding type or the reconstructor** additionally
needs the consumers checked — `.github/workflows/downstream.yml` does that on
every PR, and the same thing runs locally against sibling checkouts:

```bash
.github/scripts/substitute-linter.sh . ../samples-controls
(cd ../samples-controls && node scripts/view-gates.mjs --strict --no-render)
```

## What the linter is

Two gates over one input. The **property gate** reconstructs the XML view a
class builds — by replaying its `z2ui5_cl_ui5_view_builder` chain, statically
— and judges it against a snapshot of the UI5 metadata, together with the
ABAP around it: bindings against the class's attributes, events against its
handlers, wires against the frontend's whitelists, the lifecycle of `main( )`.
The **render gate** (optional package `@abap2ui5/linter-render`) loads each
reconstructed view in headless Chromium through a real `XMLView.create`.
Findings carry a rule id (`type`), a severity, a position and sometimes a fix;
a repository answers with its `abap2ui5lint.jsonc`, source directives and a
baseline. Details: `docs/agents/scope.md`.

## Adding or changing a rule

**A new rule is ONE file**, `lib/rules/<id>.mjs`, exporting `defineRule( )`
(`lib/rule.mjs`): id, severity, category, scope, the card (`summary`,
`detail`, `example`, `remedy`, `fixNote` when it fixes), `message( finding )`
and `check( context )` — plus one import line in `lib/rules/index.mjs`.
Severities, `describe( )`, `RULE_DOCS`, `FIXABLE`, `OPT_IN`, `SOURCE_RULES` and
the rule page read it from there. The scope says where it runs: `'class'`
for every class (`context.model`, `lib/abap-model.mjs`: tokens, statements,
sections, methods, attributes, `resolve( name, offset )` - rather than regular
expressions of its own), `'app'` at its place in `checkAbapRules( )`, `'node'`
once per view node inside the property walk (the node, its control and
metadata, the control it sits in; metadata readers are `lib/ui5-meta.mjs`,
binding-value readers `lib/binding-paths.mjs`),
`'document'` once per view document after the walk (its root; what the tree
declares, uses and links is read once by `documentFacts( )` in
`lib/view-document.mjs`), `'tree'` by the reconstructor while it builds the
view tree (`lib/reconstruct.mjs`), `'directive'` once per `abap2ui5lint-`
directive of a source (`applyDirectives( )`). An `'app'`, `'node'`,
`'document'`, `'tree'` or `'directive'` rule is called with `runRule( )` at
that place.

Then, for every rule:

1. a fixture in `test/fixtures/` and assertions — a regression test goes into
   `test/review/<topic>.mjs` (a topic, never a date), not into `test/run.mjs`
   or `test/sections/`; import the checks from
   the harness (`test/observe.mjs`), or the rule-coverage gate does not count them;
2. `npm run generate-schema && npm run generate-rules-page && npm run generate-rule-map`;
3. measure it against the sample corpora before shipping, and check that it
   can see anything at all (`docs/agents/roadmap.md`, "Rules of the trade");
4. a `CHANGELOG.md` entry under *Unreleased*.

Every rule is in this shape - there is no other place a rule is defined, and
an id defined twice throws at import. What several rules share lives in a
reader module (`lib/abap-helpers.mjs`, `lib/ui5-meta.mjs`,
`lib/binding-paths.mjs`, `lib/view-document.mjs`, `lib/wire-readers.mjs`, the
fact readers of `lib/lifecycle-rules.mjs` and `lib/chain-layout.mjs`), which a
rule file may import as long as it reaches no registry.

## Rules to carry

Each of these has been broken at least once. The number is its name — keep it.

1. **Never hand-edit a generated or vendored file**: `data/properties.json`,
   `data/icons.json`, `data/compat.json`, `data/abap2ui5lint.schema.json`,
   `data/portable-v1.json`, `data/abap2ui5-manifest.json`, `lib/abap2ui5-sets.mjs`,
   `data/abap2ui5-since.json`, `lib/abap2ui5-since.mjs`, `site/index.html`,
   `docs/agents/rule-map.md`, the README's dependents block. Each has a
   generator or a sync script in `scripts/`; `npm test` fails while one is stale.
2. **ABAP is case-insensitive outside literals and comments, and so is every
   reader.** A regex over ABAP text carries the `i` flag and folds identifiers
   it compares; `test/review/core.mjs` recases every fixture and fails on a
   difference. `lib/abap-model.mjs` does this by construction — prefer it.
3. **`lib/builders.mjs` owns the builder vocabulary.** Nothing else
   hard-codes a verb; a rule that reads a builder call builds its regex from
   `dialectOf( source )`.
4. **Ask whether the file is even collected** before deciding a rule is the
   whole fix. A class the walk drops is "no checkable app classes", exit 0 —
   the strongest false green this tool can produce.
5. **"Unknown" is not "missing".** A name whose type, shape or owner this
   source does not show is not judged: no finding on a field of a type the
   class does not declare, none on an object the linted repository defines
   itself (`ownObjects`, `lib/project-index.mjs`).
6. **A fix only when it is mechanical**, described in the rule's `fixNote`,
   its spans exact offsets into the source it was given, its line breaks `\n`
   (the entry points make them the file's). A fix that has to guess is worse
   than a finding that stays.
7. **Never put a position into a finding's `value` or `member`** — both are
   part of the baseline key. Two occurrences are kept apart with `dedupe`.
8. **A change of severity, finding type or reconstruction is checked against
   the consumers** (`downstream.yml` on every pull request; locally
   `.github/scripts/substitute-linter.sh`).
9. **A test about speed asks whether the work grows linearly**, through
   `test/timing.mjs` — never a wall-clock bound. Every walk over a tree goes
   through `lib/tree.mjs`; a recursion fails the 5,000-deep test.
10. **A section that drives the render gate is `section.browser( )`**, so the
    static half (`npm run test:static`) runs without a browser. An unmarked
    one fails it.
11. **`lib/check.mjs` reaches no renderer, no worker and no entry point** — a
    browser bundle imports it. **A rule module imports nothing that leads
    back to a registry** (`findings`, `rule-docs`, `fix`,
    `abap-rules`); `test/review/rule-units.mjs` computes it over the import
    graph.
12. **stdout is the report.** Progress, notes and prose beside a machine
    format go to stderr; the run summary's `emptyViews` is never dropped.
13. **The mirrors of abap2UI5's closed sets (`lib/frontend-actions.mjs`,
    `formatters.mjs`, `released-api.mjs`, `cc-controls.mjs`) hold closed sets
    only, and move together with `data/abap2ui5-manifest.json`** — `npm test`
    compares the two (`docs/agents/data.md`).
14. **No second reconstructor.** The frozen `z2ui5_cl_xml_view` builder is
    reported (`frozen-view-builder`) and otherwise not read; support for it
    was added and reverted once already.
15. **`--report-false-positives` and everything around it sends nothing.** The
    excerpt is a consumer's source.
16. **Merging to `main` is a release for every channel but npm**, and the
    package stays in `0.x`. `experimental/` is not shipped, not deployed and
    not supported.
