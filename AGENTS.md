# AGENTS.md — abap2UI5-linter

Single source of truth for agents working on the **abap2UI5 view linter** —
the standalone property + render gates for abap2UI5 views (classes built with
`z2ui5_cl_ui5_view_builder`, and `*.view.xml`/`*.fragment.xml`), usable as
CLI, library and GitHub Action, no SAP system required.

> This entire project is in **English**. Plain ESM JavaScript, Node >= 22,
> no TypeScript, no build step, no formatter — do not add any of those.

## Build & verify

```bash
npm ci
npx playwright install chromium   # BEFORE npm test - the first test uses the render gate
npm test                          # test/run.mjs, home-grown asserts, ~370 assertions
npm run generate-schema           # after adding a rule - the test gates the drift
npm run generate-rules-page       # ditto: docs/index.html, the published reference
node scripts/generate-icons.mjs   # data/icons.json - NEEDS NETWORK (packs 79
                                  # OpenUI5 minors), so it is not in npm test:
                                  # the committed file is the contract
node cli.mjs <files> --no-render  # fast property-gate-only loop while iterating
# settings can be pinned in the checked repo's abap2ui5lint.jsonc (lib/config.mjs;
# CLI flag > config > default; unknown keys and unknown rule ids fail loudly)
```

`npm test` fails with an unhelpful Chromium error after a bare `npm ci` —
the playwright install is mandatory, not optional. CI
(`.github/workflows/ci.yml`) runs exactly these steps on Node 22.

Changing a **severity, a finding type or the reconstructor** additionally
needs the consumers checked — `.github/workflows/downstream.yml` does that on
every PR, and the same thing runs locally against sibling checkouts:

```bash
.github/scripts/substitute-linter.sh . ../samples-controls
(cd ../samples-controls && node scripts/view-gates.mjs --strict --no-render)
```

## Scope — what the linter can and cannot see

- Input is **generic-builder classes** — `z2ui5_cl_ui5_view_builder`
  (`ele`/`tag`/`a`/`end`); `collectFiles` picks ABAP files containing
  `<class>=>factory` — plus raw `*.view.xml` / `*.fragment.xml`.
  **`lib/builders.mjs` owns the vocabulary and nothing else may hard-code a
  verb**: the reconstructor
  works on a verb's ROLE (`open`/`leaf`/`att`/`shut`), and every rule that
  reads a builder call out of the source text builds its regex from
  `dialectOf(source)`. The two are the same tree walk — the attribute target
  rule is identical (`IF t_child IS INITIAL` / last-child-or-self) — which is
  what makes one reconstructor enough; a fixture pair (`good.clas.abap`,
  `viewbuilder.clas.abap`) pins that they rebuild the SAME document.
- Classes built with the **`z2ui5_cl_xml_view` fluent builder** (the
  per-control wrapper API, also frozen) are still **silently skipped** — that
  design boundary stands, and it is a different thing from the two generic
  builders above: it has one method per UI5 control, so reading it is not a
  vocabulary mapping but a second reconstructor. Support for it was
  deliberately added and reverted once already. The way in for such a repo is
  to migrate it (as
  [cds-wrapper](https://github.com/abap2UI5-addons/cds-wrapper) did).
- The knowledge bound is the committed metadata snapshot (see below): the
  gate cannot know about anything newer than its `ui5Version`.
- **One builder chain per document.** The reconstructor reads a chain as one
  ABAP statement; a chain **split across statements on the same handle**
  (`popover->ele( … ).` then `popover->ele( \`List\` )`) keeps its cursor at
  runtime but is re-rooted here, so the document comes out with two roots.
  It fails loudly (the render gate rejects it as native HTML content) rather
  than silently — but the fix is in the port: write one chain per view.

## Rule taxonomy — where each finding type is emitted

A finding's `type` **is its rule id** — printed at the end of every reported
line, keyed in the config's `rules` block, nameable in a source directive and
offered by the JSON schema. The registry is `SEVERITY_BY_TYPE` in
`lib/findings.mjs` (exported as `RULES`); a type missing from it is not a
known rule and the config will refuse it. Emit sites (grep the id to find the
exact line):

| Emitting file | Finding types |
| --- | --- |
| `lib/properties.mjs` | `unknown-control`, `control-too-new`, `control-deprecated`, `sapui5-only-control` (with `--distribution openui5`), `unknown-property`, `member-too-new`, `member-deprecated`, `event-parameter-too-new`, `unknown-event-parameter`, `invalid-property-value`, `unknown-aggregation`, `aggregation-in-aggregation`, `too-many-children`, `invalid-aggregation-child`, `duplicate-aggregation`, `missing-required-aggregation`, `duplicate-id`, `undeclared-namespace`, `invalid-expression-binding`, `binding-for-event`, `event-for-property`, `unknown-binding-path`, `collection-bound-to-property`, `binding-type-mismatch`, `json-bind-on-scalar-property`, `uncurated-formatter` (list: `lib/formatters.mjs`), `binding-on-association`, `unknown-model`, `event-on-disabled-control`, `raw-javascript-to-frontend` (view half; the `follow_up_action` half emits in `abap-rules.mjs`), `missing-accessibility`, `aggregation-too-new` (the aggregation-TAG half of `member-too-new`, split off because UI5 resolves an unknown tag as a control class and the 404 kills the view), `toolbar-control-in-bar` |
| `lib/chain-layout.mjs` | `chain-indentation`, `chain-element-per-line` — emitted through `checkAbapRules`, so every consumer that calls it gets them. Plus `chain-house-layout`, the one **opt-in** rule (`OPT_IN` in `lib/findings.mjs`): `checkAbapRules` does not even run it unless the `rules` block asks, because its fixes span a whole chain and would defer any other rule's fix inside it to a second `--fix` pass |
| `lib/abap-rules.mjs` | `non-released-api` (list: `lib/released-api.mjs`), `obsolete-binder`, `obsolete-model-update`, `obsolete-frontend-event`, `binding-to-local`, `binding-to-reference`, `unconverted-abap-boolean`, `event-without-handler`, `event-arg-unresolved`, `event-arg-out-of-range`, `invalid-frontend-action`, `unknown-frontend-action`, `unknown-view-slot`, `invalid-keyboard-shortcut`, `invalid-action-payload`, `unescaped-brace-in-style`, `collapsed-brace-in-style`, `unused-public-attribute`, `view-never-displayed`, `popover-display-val`, `popover-anchor-unknown-id`, `hardcoded-binding-path`, `missing-view-display-on-navigated`, `separate-lifecycle-ifs`, `manual-init-flag`, `duplicate-for-iterator`, `denied-control-method`, `live-event-roundtrip`, `get-viewname-removed`, `raw-javascript-to-frontend` (escape-hatch half), `source-line-too-long` |
| `lib/icons.mjs` | `unknown-icon`, `icon-too-new`, `icon-removed` (data: `data/icons.json`) — a TEXT scan, not a view-tree walk, and called from both entry points (`checkAbapRules` for classes, `checkXmlSource` for raw XML): an icon name travels as data (a status column, a constant) at least as often as it travels as an attribute, and those never reach the node tree |
| `lib/reconstruct.mjs` | `excess-shut`, `duplicate-property`, `attribute-without-element`, `display-root-mismatch`, `open-levels` (note-only) — via `prep.structure`, consumed in `lib/index.mjs` |
| `lib/render.mjs` | render-gate failures (real `XMLView.create` errors) |
| `lib/config.mjs` | no findings — the `abap2ui5lint.jsonc`/`.json` loader (discovery, validation, precedence, the `rules` block). New config keys go through its KNOWN set + a run.mjs assertion |
| `lib/findings.mjs` | no findings — the **severity/wording/position layer** (`severityOf`, `SEVERITIES`, `RULES`, messages) plus the two things a repo can say back to it: `applyRules` (the config's `rules` block) and `applyDirectives` (`abap2ui5lint-disable-*` comments). Every consumer (CLI, VS Code extension, samples-controls `view-gates`, ai-mcp) reads what a finding *means* from here; a new finding type needs its severity classified here or consumers fall back to a default |
| `lib/report.mjs` | no findings — the **output layer**: `summarize`, the `stylish`/`json`/`markdown` formatters and the GitHub workflow-command annotations. The CLI only parses flags and picks one |

**A new rule moves five places together** — forgetting one has happened:

1. the emit site in `lib/`,
2. its severity in `SEVERITY_BY_TYPE` (`lib/findings.mjs`) — that is also what
   registers it as a rule id,
3. an entry in `RULE_DOCS` (`lib/rule-docs.mjs`) — category, summary, detail,
4. a fixture in `test/fixtures/` + assertions in `test/run.mjs`,
5. a row in the README finding-type table.

Step 4 is no longer on trust: the **rule-coverage gate** at the end of
`test/run.mjs` asserts that every id in `RULES` actually fired somewhere in the
suite, from what the checks produced (`test/observe.mjs` records it) rather
than from what the test source appears to mention. A rule registered in step 2
with no source that triggers it fails `npm test`. It is what found
`escaped-brace-in-backtick`, which had shipped with no test of any kind and
which nothing was in a position to notice.

Import the checks from `./observe.mjs` in tests, not from `../lib/index.mjs`
or `../lib/abap-rules.mjs` — a check called around the observer counts for
nothing.

**Before writing a rule, ask whether the file is even collected.** A rule can
fail in two places and only one of them is visible: it can judge wrongly, or it
can never be handed the file. `collectFiles` keeps a class that calls a view
builder's factory — anything else is dropped, and a dropped file leaves the run
saying `no checkable app classes` with exit 0, which reads like approval.

That is how `frozen-view-builder` was missed for a year: a complete app written
on `z2ui5_cl_xml_view` was not merely unjudged, it was invisible, and the
strongest false green this tool can produce is the one where it looked at
nothing. A findings test would never have caught it — the test for that rule
runs `collectFiles` over a real directory on purpose, because collection was
where it was broken.

So when a rule is about a shape this linter does not model, check what the CLI
prints for a file of that shape *before* deciding the rule is the whole fix.

Then regenerate and commit both artefacts — `npm test` fails while either is
stale:

```bash
npm run generate-schema      # data/abap2ui5lint.schema.json
npm run generate-rules-page  # docs/index.html
```

`lib/frontend-actions.mjs`, `lib/formatters.mjs` and `lib/released-api.mjs`
are the **hand-maintained** knowledge files (`lib/builders.mjs` is a fourth
mirror of upstream, but of two class INTERFACES rather than of a closed set —
it changes only when a builder does), and all three are watched by
`scripts/check-upstream.mjs` (weekly via `upstream-sync.yml`, on drift an
issue): it re-derives the curated formatter exports and the `GLOBAL_TARGETS`
map from the abap2UI5 sources and fails on any difference — so an upstream
change becomes an issue here instead of a silent false positive at some
user's desk. On `lib/frontend-actions.mjs` in detail:
the closed whitelists `invalid-frontend-action` judges against. Its source of
truth is abap2UI5's frontend action modules (`app/webapp/core/actions/*.js`,
shipped as the `z2ui5_cl_ui5f_*_js` classes) — JavaScript embedded in an ABAP
string concatenation, which is not worth parsing, and that repo is not a
dependency here. Refresh it by reading `GLOBAL_TARGETS` and `BINDING_METHODS`
in `actions/ControlCall.js`. Kept in step 2026-08-02 with abap2UI5's new
`POPUP: setWithinArea` target (`sap.ui.core.Popup.setWithinArea`, @since
1.89) — a target added upstream is a **silent** breaking change here until
this file follows: the linter reports the correct new wire as an
`invalid-frontend-action`. Only **closed** sets belong in it, which is why
`CONTROL_BY_ID` is mirrored from its DENIED side (`CONTROL_METHOD_DENY_EXACT`,
`CONTROL_METHOD_DENY_PREFIXES` → `denied-control-method`) and not from an
allowed one: any public control method the denylist misses runs, so a
whitelist would report correct code while the denylist reports only wires the
frontend provably refuses. That mirror drifts in **both** directions —
a newly denied method is a wire the linter still calls fine, a freed one stays
reported as broken — so `check-upstream` compares both arrays.

A rule may also carry `fixes: [{ start, end, text }]` (see `lib/fix.mjs`):
exact spans in the source it was given, applied by `--fix`. Attach them only
when the correction is mechanical — a fix that has to guess is worse than a
finding that stays — and describe it in the rule's `fixNote`, which the test
requires for everything listed in `FIXABLE`.

## Deliberate kinship with ui5lint and abaplint

The audience is the audience of [UI5/linter](https://github.com/UI5/linter)
and [abaplint](https://github.com/abaplint/abaplint), so the surface is
theirs on purpose and a change that drifts from it needs a reason:

| Ours | Modelled on |
| --- | --- |
| `path` heading, `line:col severity message rule-id`, `N problems (…)`, `Success! No findings detected.` | ui5lint's stylish formatter |
| `--format stylish\|json\|markdown`, `--quiet`, `--version` | ui5lint |
| `--fix` plus a `*_FIX_DRY_RUN` env escape | ui5lint's `--fix` / `UI5LINT_FIX_DRY_RUN` |
| `abap2ui5lint-disable-next-line`/`-disable-line`/`-disable`/`-enable`, reason after `--` | ui5lint directives |
| `abap2ui5lint.jsonc`, `rules: { id: false \| severity \| { severity, exclude } }`, JSON schema for editor completion | abaplint's config and `BasicRuleConfig` |
| `docs/index.html` — one searchable page, one anchor per rule id | rules.abaplint.org |
| bin alias `abap2ui5lint`, exit codes 0/1/2 | both |
| workflow-command annotations on the PR diff | abaplint's `actions-abaplint` |

Known deliberate divergences: severities are `error/warning/hint` (not
abaplint's `Error/Warning/Info` — `hint` is already load-bearing across
consumers), rule ids are kebab-case like ui5lint's rather than abaplint's
snake_case, and a corpus run adds the run summary below — neither reference
linter has one, because neither is usually pointed at a few hundred files
whose findings are all baselined.

The former test-coverage debt (`invalid-aggregation-child`,
`sapui5-only-control`, `open-levels`) is worked off — every rule now has an
assertion, and the README finding tables (place 5 above) are gated by a
test that checks every rule id appears in them.

## What a run says about itself — summary, progress, badges

A finding list is a report on what is WRONG, and a corpus with a baseline is
by construction a corpus with no findings: `samples` prints three lines for
148 classes, and those same three lines are what a run prints when the
reconstruction produces nothing at all. The gate cannot be trusted from its
own silence, so three things describe the run instead of its findings:

| | Where | Default |
| --- | --- | --- |
| **run summary** — sources, documents, controls/bindings/icons judged, the control histogram, gates, baseline shape, phase times | under the count line (`stylish`), `### Run summary` (`markdown`), `stats` (`json`) | on above one file; `--stats` / `--no-stats` |
| **progress** — one rewriting line per gate, or one log line per file inside a collapsed `::group::` in Actions | **stderr**, so stdout stays pipeable | on a TTY and in Actions; `--progress` / `--no-progress` |
| **badges** — two shields.io endpoint JSONs: the corpus (`abap2UI5` grey \| `148 apps · 172 views · 2,176 controls` blue) and the verdict (`check-abap2UI5` grey \| `83 rules passed` green) | the files `--badge-corpus` / `--badge`, or config `badge` (a list, one entry per kind) | off |

Rules that hold for all three:

- **The numbers come from the walk the gate already did** (`profileTree` in
  properties.mjs, aggregated per result into `result.stats`). Nothing is
  re-parsed for the summary and nothing in it can fail a run.
- **`emptyViews` is the point, not a detail.** "7 classes produced none" is
  the only thing in a green report that can say the gate is not seeing the
  corpus. Never drop it to shorten the block.
- **The progress log carries no finding counts.** At that moment neither the
  baseline nor the `rules` block has spoken, so a fully baselined corpus
  would log hundreds of findings and then report none. The report is the
  record; the log is only where the run currently is.
- **Two badges, because they are two statements.** The corpus badge is a
  fact that moves when somebody adds an app; the verdict badge is a judgement
  that moves on every run. They were one badge once, and the sentence it
  produced ("abap2UI5-linter 148 apps · 172 views · 2,176 controls | clean")
  made the reach something to read on the way to the colour. Each badge now
  keeps the shape a README reader knows: a grey name, one thing to read.
- **The verdict counts the rules that RAN** — the registry minus what the
  repo's `rules` block switched off, the way a test badge counts tests. What
  a baseline swallowed is the run summary's business: those findings exist.
- **A badge writes only keys the shields endpoint schema defines** — an
  extra key makes shields render "invalid" in the README of everyone who
  sees it — and both are written before the exit code is decided, because the
  failing run is the one whose badge matters.
- **stdout stays the report.** Progress goes to stderr, and the summary joins
  the machine formats as data (`stats`), never as prose — the same rule the
  annotations and the baseline note follow.

## Static-check roadmap — app knowledge that can still move into the gate

The mission is to encode as much app-building knowledge as possible as
static checks, so an agent learns a rule from a finding instead of a doc.
**The list distilled from the app guide and the samples-controls gotchas is now
worked off**; every entry shipped:

| Roadmap entry | Rule |
| --- | --- |
| Popup/view root mismatch | `display-root-mismatch` |
| Strictly-typed property bound to a character field | `binding-type-mismatch` |
| `get_event_arg( n )` beyond the declared arity | `event-arg-out-of-range` |
| Frontend-action wire tokens | `invalid-frontend-action` (+ `lib/frontend-actions.mjs`) |
| Collapsed-brace expression bindings | `collapsed-brace-in-style`, alongside `unescaped-brace-in-style` |
| Unbound PUBLIC attribute | `unused-public-attribute` |
| Date/time model type without a `source` format | `date-type-without-source` |
| `CONTROL_BY_ID` naming an id no view declares | `frontend-action-unknown-id` |
| Relative binding on a control with no binding context | `relative-binding-without-context` |
| `CONTROL_BY_ID` `set…( )` on a bindable property | `settable-property-via-action` |

The last one shipped **narrower than it was written**: "no view binds it" is
not the same as dead. A PUBLIC attribute used only in ABAP code is state, not
ballast — PUBLIC is precisely how a value survives the roundtrip — so only a
name that appears once in the whole class, its own declaration, is reported.
Keep that distinction if the rule is ever widened.

The `date-type-without-source` entry came from the samples-controls port of
`sap.ui.core.sample.TypeDateAsDate` (app 282): its JSON model holds a JS
`Date`, which an ABAP-fed model can never carry, so the port has to add
`formatOptions.source` to every binding. Neither the property gate (the
member exists) nor the render gate (it mocks the model) can see the
omission — a static read of the binding-info string can.

`frontend-action-unknown-id` came from the same batch (app 284, a
`navigateBack` on a MessageView that lives in the popup slot): the id is
the only part of a `CONTROL_BY_ID` wire nothing validated, and a wrong one
is silent in exactly the way the whole rule family exists for. It is
deliberately narrow — the id set is trusted only when EVERY `id`
attribute of the class is a literal, so a class that builds ids at
runtime is not judged at all.

`relative-binding-without-context` closes the **flattened-element-binding**
trap the samples-controls porting guide could until now only describe as a manual
audit ("a `_bind`-less `` v = `{FIELD}` `` whose FIELD is a root-level DATA
scalar") — seven of its ports had shipped the wrong form. It needed a third
view of the class: the model and the shape only carry BOUND variables, so
`prepareAbap` now also returns `rootFields`, every attribute the class
declares. And it is the textbook case for the corpus rule below — the first
version reported four bindings in `sap.ui.table` **column templates**, which
are cloned per row and get their context from the table's `rows` binding in a
sibling aggregation. The corpus was right; the rule now treats any
`template` aggregation as a row context.

`settable-property-via-action` needed a THIRD input the ABAP-side rules did
not have: what the id in a wire actually is. `collectControlIds` +
`memberSection` / `propertyDecl` are exported from `properties.mjs` for it,
and `checkAbapRules` now takes `{ data, controlIds }` — with neither, the
rule simply stays silent. Its whole precision lives in the metadata: an
**association** (`selectedSection`) and a **function-typed** property
(`MessagePopover.asyncURLHandler`) can never be bound, so both are excluded
rather than reported and excused. It found five real ports on the corpus,
all five converted to bindings.

The 2026-08 round promoted the corpus-independent half of samples-controls's
`pattern-lint.mjs` into real rules, so every consumer sees them instead of
one repo's gate script:

| Origin | Rule |
| --- | --- |
| pattern-lint `popover-display-val` (hold-out probes 607/613/617) | `popover-display-val`, with a `--fix` |
| pattern-lint `uncurated-formatter` (formatter pack removed upstream) | `uncurated-formatter` + `lib/formatters.mjs`, the hand-maintained curated list — the render harness mirrors it, a test keeps the two in step |
| pattern-lint `hardcoded-binding-path` (samples 456/457 human find) | `hardcoded-binding-path`, with the OData-entity-path and `<style>`-span exemptions |
| pattern-lint `duplicate-for-iterator` (app 234) | `duplicate-for-iterator` |
| app-guide lifecycle chapter | `separate-lifecycle-ifs` (guard blocks that RETURN are exempt — the linter's own `good` fixture is the precedent) and `missing-view-display-on-navigated` |
| snapshot params were complete all along | `unknown-event-parameter` — existence per event, but only for an event the control declares ITSELF: the first corpus run flagged `DateRangeSelection change` reading `from`/`to`/`valid`, which the metadata declares on `InputBase` with only `value` — a subclass can widen an inherited event without redeclaring it |

The corpus rules stay in pattern-lint only where they encode CORPUS policy
(method order, formatting, sidecar headers) — those do not belong here.

The second 2026-08-04 round added, each corpus-measured first:

| Origin | Rule |
| --- | --- |
| samples-controls app 043's live BINDING_ERROR (found by the e2e interaction that closed its LIVE_TEST) | `binding-to-nonpublic` — only PUBLIC attributes are serialized, a bound PROTECTED one fails the first roundtrip |
| samples-controls's documented residual gap ("enum values newer than 1.71 are invisible") | `enum-value-too-new` + the generator's `enumSince` map — its first corpus run confirmed the two hand-written POST_171 declarations on app 028 (`GenericTile frameType` OneByHalf/TwoByHalf @1.83) |
| the last two generic pattern-lint rules | `ui5-internal-access` (mProperties & friends), `commercial-ui5-host` |
| `hardcoded-binding-path` said "don't", nothing said "does it exist" | `unknown-binding-path` now also judges `path: '/X'` in complex binding infos and `${/X}` in expressions — the first corpus run found the row-index trap (`/T_ITEMS/9/TEXT` is legal; numeric segments now step into the bound table's row) |

The 2026-08-09 round asked the same question of the two knowledge sources the
earlier rounds had not fully mined — the FRONTEND's own closed sets, and the
UI5 member KINDS the snapshot already carries:

| Origin | Rule |
| --- | --- |
| the CONTROL_BY_ID denylist in `actions/ControlCall.js` — the closed half of a wire whose allowed half is open | `denied-control-method` + `CONTROL_METHOD_DENY_EXACT`/`_PREFIXES` in `lib/frontend-actions.mjs`, both gated by `check-upstream` |
| `XMLTemplateProcessor` never parses an association attribute as a binding (`_iKind === 3` → `createId(sValue)`) | `binding-on-association` |
| abap2UI5 serves ONE model per slot; a ported sample's `{ui>/x}` / `{i18n>KEY}` survives the port silently | `unknown-model` |

`denied-control-method` is the complement the mirror file had explicitly ruled
out: "CONTROL_BY_ID's method list is deliberately absent … open by design". The
ALLOWED side is open — but the DENIED side is a closed set, and a wire naming
one of those is exactly as silent as an unknown id (`FrontendAction` logs and
returns). It is only expressible because upstream split the denylist into an
EXACT half and a PREFIX half in the same round: while `removeAll` was a prefix,
"denied" and "a named per-aggregation method the runtime allows" were not
distinguishable, and the rule would have reported working code.

`unknown-model` is the first rule that needed the ABAP class to say what is
*allowed* rather than what is wrong: `SET_ODATA_MODEL` is the one wire that can
widen the framework's three models, so `namedModels( )` collects it and a class
that registers one under a non-literal name is not judged at all — the same
caution `viewIds` takes. All three measured **0 findings across the 340-file
samples-controls corpus**, each with a fixture proving it sees its own defect and
leaves the neighbouring legal form (`removeAllContent`, `device>`/`message>`/a
registered `srv>`) alone.

Also in that round: `undeclared-namespace` gained a `--fix` for the
conventional prefixes, `--format sarif`, the adoption **baseline**
(`--update-baseline`, stale entries FAIL), a page POOL in the render gate
(`openRenderer({ pages })`, `checkFiles` uses 4 — the corpus render wall
clock divides accordingly), and `scripts/check-upstream.mjs` +
`upstream-sync.yml`, the weekly drift gate for the two hand-maintained
knowledge files below.

The 2026-08-11 round mined the SAMPLES repo's ~1000-commit history and the
framework's frontend JS for silent-failure boundaries the earlier rounds had
not touched:

| Origin | Rule |
| --- | --- |
| the framework gained `_bind` parameters the reconstructor did not know — an `omit_initial_paths`/`json` bind DROPPED its attribute from the reconstructed view, blinding every gate to it | `bindingOf` now parses named args; shape-neutral params (`omit_initial`, `omit_initial_paths`, `json`, `view`) reconstruct as the plain binding, shape-CHANGING ones (`tab`, `custom_mapper`, `switch_default_model`) still stay unresolved on purpose |
| samples-controls porting guide: round-trips are serialized, an event in flight DROPS the ones behind it (measured on app 280) | `live-event-roundtrip` — a `liveChange` wired to `client->_event( )`; hint, 5 deliberate demo wires on the corpus, all advisory |
| samples history: one sweep replaced hand-rolled init flags in 111 classes (`7b210d1`), and the antipattern kept reappearing for years | `manual-init-flag` — only the unambiguous shape (flag-gated branch that BOTH sets the flag AND displays a view); a lazy-load guard that displays nothing is left alone |
| samples history: `_bind( )` on a `TYPE REF TO` attribute throws at runtime, found twice by users hitting the exception (`ca9d86d`, `8d477fe`) | `binding-to-reference` — `ref->*` and plain data attributes stay silent |
| samples history: handlers wired next to a literal `enabled="false"` (`ec1efe0`) | `event-on-disabled-control` — hint (a 1:1 port of a disabled-state demo legitimately carries the handler); 5 corpus hits, all exactly that |
| framework: `SET_FOCUS`/`SCROLL_TO`/`SCROLL_INTO_VIEW`/`KEYBOARD_SET_MODE` resolve their id and `return` on a miss WITHOUT EVEN A LOG — quieter than CONTROL_BY_ID | `frontend-action-unknown-id` now covers them (`ID_ADDRESSED_ACTIONS` in `lib/frontend-actions.mjs`), same viewIds trust condition |
| framework: a bad `popover_display( by_id = … )` loads the fragment, finds no anchor and DESTROYS it again — nothing opens, nothing renders red | `popover-anchor-unknown-id` |
| framework changelog: `VIEWNAME` removed from `ty_s_get` — the read no longer compiles, invisibly in a systemless pipeline (the `popover-display-val` blindness) | `get-viewname-removed` |

Also in that round: `check-upstream.mjs` now gates **`BINDING_METHODS`** too —
it was the one mirror in `frontend-actions.mjs` the drift gate did not
compare, which is exactly how a mirror rots.

Rollout note for that round: samples-controls's **advisory ratchet**
(`ADVISORY_BUDGET` in its `view-gates.mjs`, budget 0 for unknown types) makes
the downstream corpus job red until its next pin-bump PR adds
`'live-event-roundtrip': 5` and `'event-on-disabled-control': 5` — all ten
findings are deliberate 1:1 demo wires, so the budget, not the corpus, is the
right side to move. That is the ratchet working as designed ("the debt
decision belongs at the bump PR"), not a defect in either repo.

The 2026-08-16 round closed the half of the lifecycle chapter the earlier one
had left open:

| Origin | Rule |
| --- | --- |
| the app guide said the `check_on_navigated( )` branch is "part of the canonical dispatcher, not an option", and every template in the ecosystem showed a two-branch dispatcher without it | `missing-on-navigated-branch` |

`missing-view-display-on-navigated` needed a branch to judge. The shape that
actually breaks apps has **none**, and it is invisible in a way the rest of
this list is not: the app works, standalone, indefinitely. It breaks on the
first roundtrip that raises `check_on_navigated( )` without
`check_on_init( )` — a sub-app or a built-in `z2ui5_cl_pop_*` value help
handing control back, or a bookmarked draft being restored — and then only by
leaving the wrong view on screen.

Its precision lives in **not** being a text search. Every lifecycle
`IF … ENDIF` construct is cut out of `main( )` (`ifBlockEnd`, which steps over
the `ELSEIF` branches `ifBranchEnd` stops at) and what remains has to reach no
display. Two legitimate shapes exempt themselves that way: an ungated
`view_display( )` after the chain, which covers every roundtrip
(`samples`'s `z2ui5_cl_smp_app_025` — the text search called it broken), and
the `client->nav_app_leave( )` a popup helper ends on (abap2UI5's own
`z2ui5_cl_pop_data`). A class that displays nothing is a helper and belongs to
`view-never-displayed`. Those exemptions are 36 of the 573 classes a text
search would have named.

Rollout note for this round, and it is a bigger one than any before it: this
is the first rule that adds findings to every corpus at scale — `samples` 85,
`samples-controls` 425, `samples-stack` 27, `app-template` 0, one per class.
The downstream job is red until the pin-bump PRs decide it, and both
instruments already exist: `--update-baseline` for the two baselined corpora,
`ADVISORY_BUDGET` for samples-controls. Unlike the ratchet note above, the
corpus is **not** the right side to leave alone here — every one of those
classes really does go blank behind a navigation, the fix is two lines, and
the templates that produced them were corrected in the same round
(abap2UI5 `README.md` + `build-an-app`, samples-controls `scaffold.mjs` +
`generation-prompt.txt` + `port-a-sample`). A baseline here should be read as
"not yet", not as "allowed".

The second 2026-08-11 round worked that backlog off — the frontend's
remaining closed sets, each mirrored in `lib/frontend-actions.mjs` AND gated
by `check-upstream.mjs` in the same change (the BINDING_METHODS lesson):

| Origin | Rule |
| --- | --- |
| the `handlers` dispatch table (35 names) misses with NO log at all, and a literal action name skipped the whole rule family (everything keyed on a `cs_event-` token) | `unknown-frontend-action` + the loop now resolves literal action names; `FRONTEND_EVENTS` / `FRONTEND_EVENT_ALIASES` (the five server-remapped `*_NAV_CONTAINER_TO` names — deliberately ungated, they live in the server, not the frontend source) |
| `FILTER_OPERATORS` (14, case-sensitive): `contains` logs and leaves the binding untouched; the compound form is `[[["path","Op","v"]]]` — groups of ROWS, and a missing nesting level is "bad filter row" upstream | the `binding_call` `ACTION_ARGS` slot (inert without a value slot — the runtime clears first) + the compound-groups walk (`invalid-action-payload` for shape, `invalid-frontend-action` for a row operator) |
| a wrong `view` slot literal SUPPRESSES CONTROL_BY_ID's global id fallback; `cs_view-nested` is `NEST`, not `NESTED` | `unknown-view-slot` (the `view` parameter + `SET_SIZE_LIMIT`'s view key) |
| URLHELPER's action map misses as `if (fn) fn()` — silent no-op | `urlhelper` in `ACTION_ARGS` |
| the `object`-kind CONTROL_METHODS payloads: not-JSON silently becomes `{}` (castArg), unknown enum keys are dropped by UI5 | `invalid-action-payload` + `OBJECT_ARG_METHODS` (sap.m.Sticky / sap.ui.core.Priority values judged against the snapshot's enums) |
| a modifiers-only shortcut combo is logged once and never registered; its scope is a slot or a declared id; its EVENT (and START_TIMER's callback) is a backend event like any other | `invalid-keyboard-shortcut` + shortcut/timer events feed `event-without-handler` |
| every remaining id-bearing arg: wizard/variant-init/BINDING_CALL ids, CONTROL_BY_ID *argument* ids (the `controlId`/`anchor` kinds, re-derived from CONTROL_METHODS by the gate) | `ACTION_ID_SLOTS` / `CONTROL_METHOD_ID_ARG`, all through `frontend-action-unknown-id` |
| `_bind( json = abap_true )` is OUTBOUND-only and splices a JSON node — wrong on any scalar-typed property, correct on `object`/`any` | `json-bind-on-scalar-property`, via `prepareAbap`'s new `jsonPaths` |
| the mock model handed the renderer seeded `''` values that `omit_initial_paths` never serializes | `applyOmit` in the reconstructor — the render model now drops initial values of omitted fields, the SHAPE keeps them (the unseeded-tables split again) |

The corpus run for that round caught two false-positive shapes before they
shipped (the doctrine working): `$event.oSource.sId` anchors are resolved
CLIENT-side (any `$`-prefixed value is not a static id), and
`literalElements` used to hand a |…| template's RAW text to the rules — a
template with an interpolation is now `null` like any other runtime value.

Same round, by explicit project decision: **`raw-javascript-to-frontend`**
(warning) — the frontend is a renderer, behaviour travels as data, never as
code. Three shapes, one rule id: `follow_up_action`'s raw-JS escape hatch (a
non-name literal `val` is inserted verbatim as `custom_js` —
`z2ui5_cl_ui5_client~follow_up_action`), a hand-written handler string on an
event attribute (UI5 evaluates it as JavaScript; the literal-on-event cell
that completed the `binding-for-event` / `event-for-property` matrix), and a
`<script>` tag in an attribute value. ABAP classes only — a raw `.view.xml`
has a controller whose handler names belong there (`fromAbap` in
`checkNodes`). A `_event_client` with a non-name literal is different: it has
no raw-JS path, so that is an `unknown-frontend-action` instead.

The 2026-08-12 round read the deprecations `z2ui5_if_client` states in its own
ABAP Doc — the cheapest knowledge source of all, and the one nothing had mined:

| Origin | Rule |
| --- | --- |
| "the model is pushed AUTOMATICALLY … the manual push methods are obsolete" — `view_model_update`, `nest_view_model_update`, `nest2_view_model_update`, `popup_model_update`, `popover_model_update` are **empty methods** in `z2ui5_cl_ui5_client`, kept only so existing apps compile | `obsolete-model-update`, with a `--fix` that DELETES the call |
| `_event_client( )` → `follow_up_action( )` — since upstream gave `follow_up_action` a `RETURNING` parameter, its `IF result IS SUPPLIED` branch runs `mo_srv_event->get_event_client( )`, which is `_event_client`'s entire body: one method both schedules a frontend action and wires one | `obsolete-frontend-event`, with a rename `--fix` |
| `_bind_edit`'s `custom_mapper_back`/`custom_filter_back` exemption expired: upstream still ACCEPTS them for source compatibility but no longer evaluates them ("per-direction mapping is gone") | `obsolete-binder` now reports those calls too — **without** the fix, because the arguments have to go with the rename and dropping an argument is not one |

Three consequences worth keeping in mind if any of this is revisited:

- **`missing-view-display-on-navigated` lost `view_model_update( )` as an
  accepted re-display** in the same change. It had to: the call is a no-op
  now, and the automatic push that replaced it reaches the MAIN *slot* —
  which after a navigation still holds the CALLED app's view. Leaving it in
  would have made `--fix` turn a green branch red by deleting the very call
  that excused it.
- **A deleting fix is a new shape** (`statementSpan` in `abap-rules.mjs`): it
  takes the whole line when the call has that line to itself, and only the
  statement when anything else shares it — including a trailing comment,
  measured on the ORIGINAL source where a comment is still visible. Removing
  a comment nobody asked about is exactly the guess `fix.mjs` forbids.
- **`raw-javascript-to-frontend` splits by POSITION now, not by method name.**
  The raw-JS escape hatch is `follow_up_action` *queued as a statement*
  (`queue_app_event` → `custom_js`); where its result is consumed it takes the
  same `get_event_client( )` path `_event_client` always took, which has no
  `custom_js` at all. Without that split the rename fix would have turned an
  `unknown-frontend-action` on a wired `_event_client` into a
  `raw-javascript-to-frontend` on the identical wire. The `--fix` is what
  forced the precision; the imprecision arrived with the upstream
  `RETURNING` parameter.

Note what `obsolete-frontend-event` does NOT do: `_event_client` is still a
live method that the wire rules must keep judging, so the whole frontend-action
family keeps matching **both** names (`/client->(_event_client|follow_up_action)/`).
Only the deprecation rule is one-sided. This one was read out of the
framework's *implementation* rather than its ABAP Doc, which is the reverse of
the other two — the interface caught up in abap2UI5 the same day
(`52eb4b9f`), so `z2ui5_if_client` states all three now.

Measured in place of the samples-controls corpus (not checked out in that session):
abap2UI5's own 9 builder classes, **2 findings** — two dead
`view_model_update( )` calls in `node/srv/zcl_tst_focus.clas.abap` and a wired
`_event_client( cs_event-open_new_tab )` in `z2ui5_cl_ui5_app_start`, all real.

The 2026-08-14 staging round emptied the abap2UI5 repo's **`ui5-check` skill**, which
is explicitly written as this linter's staging area: every entry there carries
a `Linter:` line saying whether a rule already decides it, what data a rule
would need, or why it can never be one. Three of them were marked ready:

| Origin | Rule |
| --- | --- |
| `ui5-check` §1.1, a user report ("not all icons are shown") that turned out to be TWO unrelated defects in one screenshot | `unknown-icon` (error), `icon-too-new` and `icon-removed` (warnings) + `data/icons.json` — see below |
| `ui5-check` §2.1, three overview headers silently losing every icon after a separator | `toolbar-control-in-bar` — reported only below 1.76; the parent test is exact (`Toolbar` does NOT inherit from `Bar`), plus `Page headerContent`, which forwards into an implicit Bar |
| `ui5-check` §3.1, `<footer>` on a `sap.m.Dialog` killing a 1.71 view outright | `aggregation-too-new` — a severity SPLIT of `member-too-new`: a post-floor property is dropped and the control still renders, a post-floor aggregation tag is resolved as a control class and the 404 takes the whole view down |
| `abap-check` §1, `abap2UI5/samples#669` — over-length lines left two demo classes as EMPTY STUBS after an import that reported the error and carried on | `source-line-too-long` (error, 255 chars). Not a view rule, deliberately: for a consumer repo whose only gate is `npx abap2ui5lint`, a class that cannot be imported is the most severe thing this tool can find |

`data/icons.json` is the round's new knowledge file, and the first one built by
**scanning history** rather than one snapshot: `scripts/generate-icons.mjs`
packs the `@openui5/sap.ui.core` registry of every minor from 1.71 to the
pinned version (79 releases) and records, per icon, the release it first
appears in. That is what makes `icon-too-new` answer for *any* target instead
of only for the floor — the staging entry had proposed a bare 1.71 name list,
which would have been silent above the floor. It also surfaced a fact no
snapshot could: the font is not purely additive (`binary` @1.104 is
`non-binary` from 1.120 on, same codepoint), hence `icon-removed`.

Unlike `generate-metadata.mjs` this generator needs **network**, so it is not
part of `npm test`: the committed file is the contract and the test checks its
shape. Two parsing notes for whoever regenerates it — the registry declares a
few names with capitals and at least one with double quotes, and icon names are
effectively **lower-case** anyway (`IconPool` reads them as a URI hostname), so
every comparison lower-cases. A camelCase name is not nearly right; it matches
nothing in any release.

Corpus run for that round (416 ports): 6 `icon-too-new`, 1
`toolbar-control-in-bar` — the overview header `ui5-check` §2.1 names, found
again by the rule written from it — 24 `aggregation-too-new`, all already
carrying a `POST_171` deviation, and 0 `source-line-too-long`. The 24 are why
the downstream repo needed preparing in the same change: its `VERSION_TYPES`
had to learn the new type (or a pin bump would have failed 24 ports at once),
and its `declares()` had to read a finding's `value`, since an icon finding
names the glyph there and carries no control or member at all.

The 2026-08-14 round asked the one question no rule had asked yet — not
*how* an app uses the framework, but **what of it it is allowed to name at
all**:

| Origin | Rule |
| --- | --- |
| abap2UI5 releases exactly ONE package, and says so in the package descriptions themselves: `src/02` is "released APIs", `src/01` is "internal use only", `src/99` is "FROZEN legacy code … ships solely so existing downstream installations keep compiling" | `non-released-api` + `lib/released-api.mjs`, the third hand-maintained mirror, gated by `check-upstream` |

Everything about that rule follows from one property of the boundary it
guards: **neither side announces a change.** Upstream commit `db10b13`
(the same day the rule was written) renamed the whole core layer
`z2ui5_cl_core_*` → `z2ui5_cl_ui5_*` AND moved `z2ui5_cl_http_handler` and
`z2ui5_if_types` into the frozen package — one commit, no deprecation,
nothing a compiler sees until the object is already gone. That is the same silence `get-viewname-removed` covers, one layer up.

Three decisions worth keeping if it is revisited:

- **It judges a closed WHITELIST plus known families, never "unknown".** The
  released five are silent, the frozen package is listed by name, the
  internal packages are matched by the prefixes upstream reserves
  (`z2ui5_cl_ui5_*`, `z2ui5_cl_ui5f_*`, the ajson/srtti/util copies) — and
  anything else beginning `z2ui5_` is **somebody else's class**: the samples
  are `z2ui5_cl_demo_app_*`. Under-reporting a family this file has not
  learned yet is the tolerable direction; reporting an app's own class is
  not. `check-upstream` closes that gap from the other end — it fails when an
  upstream object outside `src/02`/`src/99` matches no family.
- **One frozen object is deliberately tolerated**: `z2ui5_if_types`, because
  the RELEASED `z2ui5_if_client~get( )` returns `z2ui5_if_types=>ty_s_get` —
  an app cannot avoid the name, and is not the one to fix that.
- **Measured** (the samples-controls corpus was not checked out): 0 findings on
  abap2UI5's own 5 builder classes and its 5 test apps — modern app code
  already obeys the rule — and, as the "check it can see anything at all"
  half, **49 distinct internal objects across the framework's own 118
  classes** (`z2ui5_cl_ui5_util_context` 28×, `z2ui5_cl_xml_view` 18×), in
  279 ms. Framework code naming its own internals is not what the rule is
  for; that run only proves the scan reaches real ABAP at scale.

Rollout note, the same shape as the `live-event-roundtrip` round: this rule
will light up an app corpus that grew up with `z2ui5_cl_util` and the
built-in popups. Those findings are **real** (both packages are frozen), so
the corpus, not the rule, is the side that moves — but the debt decision
belongs at samples-controls's pin-bump PR, through its `ADVISORY_BUDGET`, not here.

How the builder itself is read:

- **`lib/builders.mjs` is the only place that knows a verb name.** A dialect
  is `{ factory, verbs, open/leaf/att/shut, handleType, boolParam, kindOf }`
  built from the builders a source actually names (cached), and
  `reconstruct.mjs` switches on the ROLE `kindOf( )` returns — never on a
  spelling. The ATTRIBUTE TARGET RULE is the one thing the tree logic needs
  (`IF t_child IS INITIAL` → self, else last child — that is `applyToken`).
  Anything that hard-codes a verb is a bug.
- **`a( )` takes `b = <abap_bool>`** and renders `true`/`false` itself
  (reconstructed as `true`), which is what `unconverted-abap-boolean`
  corrects a `v = flag` to.
- **Proof is a fixture PAIR.** `good.clas.abap` (one flat chain) and
  `viewbuilder.clas.abap` (the same view through a helper handle) build the
  same view, and the test asserts the reconstructed documents are
  byte-identical apart from the one boolean attribute the helper fixture
  adds. Both go through the render gate. Everything else — the id set behind
  `frontend-action-unknown-id`, the `undeclared-namespace` fix (which inserts
  `)->a( `), the boolean fix — is asserted on them too.

And the same session's third round asked the one question about a chain that
has nothing to do with the view it produces — **how it is WRITTEN**:

| Origin | Rule |
| --- | --- |
| a builder chain is the one part of an abap2UI5 class NOTHING else formats — abaplint has `indentation` and `in_statement_indentation` switched off (a chain is one statement over fifty lines), so `abaplint --fix` and the auto-format workflow never touch its inner lines either | `chain-indentation`, `chain-element-per-line`, `chain-house-layout` + `lib/chain-layout.mjs` |

The argument for the family, and the reason it is not taste: the XML a
builder emits is ONE line by construction (`render( )` concatenates without
whitespace), so **the ABAP indentation is the only picture of the view's tree
that exists**. When it drifts, the tree in the file stops matching the tree in
the browser and every review after that reads a wrong diagram.

The first cut demanded the four-space step the app guide and every sample are
written in. It reported abap2UI5's own app classes, all four of its test apps
and **15 of this repo's own 26 fixtures** — on three shapes that are style,
not defect: a two-space step below the first level, a pass-through container
written at its parent's column (`)->ele( \`Shell\` )` then
`)->ele( \`Page\` )` — the standard app skeleton), and a hanging
`)->end( ).`. That is the corpus doctrine below firing in advance, so the rule
was rewritten to judge the layout against the TREE instead of against a
number: the first child under a node defines the column its siblings are held
to, and only two things are reported — a sibling out of line with its
siblings, and a call left of the element it belongs to. A chain that keeps its
own two-space rhythm is silent.

The SAME lesson then repeated on the second rule, one round later. Counting
BUILDER CALLS per line reported four lines across the corpus and all four were
the compact `tag( \`Label\` )->a( n = \`text\` … )` idiom — a control with its
own attribute, which hides no level of anything. What hides a level is a
second CONTROL on the line, so the rule counts ELEMENTS now and was renamed
`chain-element-per-line` while it was still unreleased. After both rewrites
the family reports **nothing** on abap2UI5's app classes, its test apps and 28
of this repo's 29 fixtures — only the one written to carry each defect on
purpose. Coverage, the other half of the doctrine: 67 multi-line chains and
536 line-leading calls are compared in silence across those 35 files.

Both are **hints**, deliberately: the view renders identically either way, and
this family has no business failing a build. `"chain-indentation": "warning"`
in a repo's config is the one line that changes that.

**`chain-house-layout` (2026-08) is the third, and it breaks the pattern on
purpose.** Everything above judges a chain against ITSELF; this one judges it
against one canonical form — one call per line *including attributes*, four
spaces per level, the closing call in the column of the element it closes. The
doctrine that kept the step out of `chain-indentation` still holds ("a rule
that lights up the corpus is wrong before the corpus is") — what changed is
that the corpus moved: abap2UI5, abap2UI5/samples and abap2UI5/samples-controls
were unified onto that form, and the rule now reports **0 findings across all
575 of their builder classes** while catching, on their previous state, 149 of
150 samples classes and 77 of 417 ports. The 77 are the case that matters:
their whole chain sat one level too deep, which `chain-indentation` cannot see
by construction, because a uniformly wrong rhythm is still a rhythm.

It is therefore the linter's first **opt-in** rule, and the mechanism is
general: an id in `OPT_IN` (`lib/findings.mjs`) is not emitted at all until a
`rules` entry asks for it. Two reasons, and the second is the sharper one:
a house style handed to every consumer as a default is precisely what this
family's header argues against — and its fixes rewrite a whole chain, so if it
ran by default it would overlap and defer the mechanical fixes of any other
rule that lands inside the same chain. It still lights up 22 of this repo's 29
fixtures, and that is fine: they are inputs, and nobody gets the rule unasked.

**Known candidate backlog:**

- **Raw `*.view.xml` files get no layout check.** The two rules read a builder
  CHAIN; a hand-written view file has an indentation of its own that nothing
  here judges. Doing it needs a different reader (the XML parser's node
  positions, not the ABAP statement splitter) — worth it only if such files
  turn out to be a real part of anybody's corpus.

- **The FrontendAction mirror lost its source file — fixed.** `db10b13`
  **split the JS across modules**, so `GLOBAL_TARGETS` moved to
  `z2ui5_cl_ui5f_ctrlcall_js` / `actions/ControlCall.js` and the single
  class `check-upstream` read defined none of the mirrored sets; the script
  exited 2 on "the embedding changed" before comparing a single frontend
  mirror. It now reads the whole `src/01/03/z2ui5_cl_ui5f_*_js` family and
  concatenates it (`ACTION_DIR` / `ACTION_FILE_RE`), and `parseHandlers`
  collects every `const handlers = {` rather than the first — the dispatch
  table is one per action group now. The content drift that revealed is
  closed in the same change: `VIEW_SLOTS` / `ROUTER` and
  `MESSAGE_BOX.alert` / `.confirm` added, `HISTORY_BACK` / `NAV_TO_ROUTE`
  dropped (BREAKING removals upstream), and `POPUP_CLOSE` / `POPOVER_CLOSE`
  moved to `FRONTEND_EVENT_ALIASES` — the server formats either close as the
  `["VIEW_SLOTS","destroy","<slot>"]` action, and upstream keeps both
  constants released.

New candidates go here as they are found. Two rules of the trade the last
rounds established, before anything is added:

**A corpus run also measures the RECONSTRUCTOR, not only the rule.** The
`relative-binding-without-context` round found two model defects that had
been invisible because they cancel each other out: a `DATA t_x TYPE
ty_t_x.` (a **named** table type, not the inline `STANDARD TABLE OF`
form) was modelled as a **scalar**, so the render gate silently rendered
an empty aggregation and never instantiated the template — and fixing
that surfaced the second one, an **unseeded** table being given an
invented all-empty row, which the render gate then rejects on the first
enum or date property (`"" is of type string, expected sap.m.AvatarShape`).
Now: unseeded tables are empty for the renderer and a declared row in the
shape, the same split the scalars already had.

**Measure a new rule against the samples-controls corpus before shipping it.**
`node cli.mjs /path/to/samples-controls/src --no-render --json` over 282 real
ports, diffed per finding type against `main`, is what caught three separate
false-positive shapes: an event raised by a `message_box_display( onclose = )`
callback rather than `client->_event( )`, dispatch leaking across an
`ENDMETHOD`, and a `<style>` check scoped to the ABAP *statement* — which on
a builder chain is the entire view. A rule that lights up the corpus is
usually wrong before the corpus is.

**And check the rule can see anything at all.** Zero findings on the corpus
proves nothing on its own: `unused-public-attribute` was verified by
injecting a dead attribute into a real port (caught) and by counting what it
judges in silence (120 PUBLIC declarations across 37 of 60 sampled ports, all
correctly referenced). A rule that parses nothing is also a rule that reports
nothing.

## `data/properties.json` is generated — never hand-edit

The 468 KB one-line snapshot (`ui5Version` 1.151.0, 988 controls, 219
enums) is generated from the installed `@openui5/*` packages (or
`OPENUI5_DIR`) by:

```bash
npm run generate-metadata
```

Regenerate it **only** when bumping the `@openui5/*` pins in `package.json`
(or when the generator itself changes shape), and commit both together. The
drift gate (`generate-metadata --check`) runs **inside `npm test`**: the
generation dropped from ~3 minutes to ~2 seconds when the unanchored
`(\w+)\.extend\(` scan — 167 of those 172 seconds — was replaced by a
literal-anchored one (`extendHits`). The snapshot's version bounds what the
gate can know (reasoning in the README).

**Keep the pins on the latest published `@openui5` line.** The floor the gate
checks against (`minUi5`, default 1.71) is a *separate* parameter, so a bump
does not change a single verdict on existing code — measured on the samples-controls
corpus, the 1.150 → 1.151 bump produced **0 new findings across 339 ports**.
What it does change is what a member *newer than the pin* reports as. A member
above the floor but below the pin is `member-too-new` / `control-too-new` /
`event-parameter-too-new` / `enum-value-too-new` — verdicts a consumer can
knowingly accept (samples-controls's `POST_171` deviations excuse exactly those). A
member above the *pin* does not exist in the snapshot at all and degrades into
`unknown-control` / `unknown-property` / `unknown-aggregation` — "typo?" — plus
a `render` load failure, and **no consumer can excuse those**: they are the
shape a real typo has. So a stale pin does not under-report, it *mis*-reports,
and it blocks every consumer building on a control released after it
(`sap.tnt.SideNavigationSearchField` @1.151 was the case that surfaced this).
Bumping is one PR: the pins, `npm install`, `npm run generate-metadata`, and
the snapshot header numbers above.

**The generator is published with the package** (`files[]`) and takes
`--out <file>`, because it is the ecosystem's ONLY UI5 metadata parser.
samples-controls used to carry a second one; the two drifted, and the other one was
wrong — it attributed a file-level `@deprecated` JSDoc block sitting on a local
variable to the CONTROL, marking `sap.f.DynamicPageTitle` and
`sap.f.semantic.SemanticPage` deprecated when neither class doc says so. Its
`generate_result` workflow now runs this generator instead:

```bash
OPENUI5_DIR=./openui5 node node_modules/@abap2ui5/linter/scripts/generate-metadata.mjs \
  --out ui5/properties.json
```

Note what that does **not** mean: samples-controls does not reuse `data/properties.json`
itself. It builds its sample universe from an OpenUI5 *checkout* that can be
newer than the `@openui5` packages pinned here (1.152 vs 1.151 at the time of
writing, and npm has no 1.152), and a snapshot older than the universe loses
the `@since` of controls introduced in between — `scopeOf` then reads them as
in scope (`sap.f.HeroBanner` @1.152 is the live example). So: **one generator,
two invocations**, each at the version its own consumer needs. Keep the
generator's output shape additive for the same reason the `--json` shape is
frozen — samples-controls's coverage docs read `controls[…].since` / `.deprecated`.

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

## `github-app/` — a spike, not a channel

`github-app/` is a working prototype of the linter as a hosted **GitHub App**
(webhook → installation token → property gate → check run), written to answer
"what would this take" with running code. **It is not deployed, not registered
and not part of any release** — the npm `files` allowlist excludes it, so it
never reaches the package. Treat it as documentation that happens to execute.

- It runs the **property gate only**, and that is the load-bearing decision:
  `checkAbapSource`/`checkXmlSource` take source rather than a checkout, so a
  delivery is linted in memory with no clone and no temp directory. The render
  gate needs Chromium plus ~140 MB of `@openui5/*` per run and stays in the
  consumer's CI. It is the same split the VS Code extension already lives on.
- `node github-app/dryrun.mjs <path>` runs the identical
  `lintSource`/`toAnnotations`/`summarize` path against local files and prints
  the check-run payload — the only part testable without registering an App.
- Its README lists what separates the prototype from a service (persistence,
  rate limits, installation lifecycle, operations). That list, not the code,
  is why this is a spike: the missing work is ongoing, not one-time.
- **npm publishing does not replace the git-SHA pins.** samples-controls and
  the VS Code extension keep pinning `github:abap2UI5/linter#<sha>`; the
  downstream workflow keeps being what says a bump is safe. npm serves the
  consumers that have no such workflow — a developer linting their own app,
  and anyone who wants a pinnable version instead of `@main`.
- **`docs/index.html` is published on merge** to
  https://abap2ui5.github.io/linter/ by `.github/workflows/pages.yml` — a
  reworded rule detail is live the moment it lands on main. The workflow only
  serves the committed file, it never regenerates it: a generator running in
  CI would paper over a stale commit instead of failing on it. Pages has to be
  enabled once in the repository settings, source "GitHub Actions".
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
- The VS Code extension additionally pins a **linter commit SHA** in its
  `package-lock.json` for the bundled property gate — a new finding type is
  invisible in the editor until that lock is bumped there.
- **`abap2ui5lint.jsonc` is honoured by the CLI, the Action AND the VS Code
  extension** — the extension discovers it via `findConfigFrom`/`loadConfig`
  from `@abap2ui5/linter/config` and lets it beat the VS Code settings
  ("that is what CI checks against", its `src/lintconfig.ts`). The editor/CI
  divergence this bullet used to describe is closed; keep the config loader
  backward compatible, three consumers read it now.

## Relation to samples-controls — this repo is canonical now

> **One name, three spellings in the history.** The corpus repository is
> `abap2UI5/samples-controls`; it was `abap2UI5-api` before that and
> `ai-demokit` before that. It is referred to by its current name throughout
> this file, including where the events described predate a rename — older
> commit messages and PR titles still carry the old ones.

samples-controls's ancestor scripts (`property-check.mjs`, `structure-lint.mjs`,
`render-smoke.mjs`) were **deleted** when its gates were consolidated onto
this linter: samples-controls consumes `@abap2ui5/linter` as a git npm dependency
and keeps only the corpus policy in its `scripts/view-gates.mjs` (which
ports, POST_171 deviations, declared skips, advisories). Rules of thumb:

- **All generic view-checking logic lives here**; samples-controls-specific gate
  policy (sidecar deviations, corpus conventions) stays in `view-gates.mjs`.
- A behaviour change here changes samples-controls's CI verdicts on the next
  dependency bump. **`.github/workflows/downstream.yml` runs that check for
  you** on every push and PR — see below; you no longer have to remember to
  run the corpus by hand.
- Both consumers pin this repo by **commit SHA**
  (`github:abap2UI5/linter#<sha>`), so a merge here never moves them on its
  own; bumping the pin is a deliberate change in the consumer, and the
  downstream workflow is what says whether that bump is safe. A pin pointing
  at a **feature branch** of this repo is only ever temporary — it must become
  a SHA on main before that consumer's change is merged.

## The downstream contract — `.github/workflows/downstream.yml`

`npm test` only ever proves this linter against its own fixtures. The
downstream workflow proves it against the repos that actually consume it,
with **this checkout substituted for the SHA they pin**
(`.github/scripts/substitute-linter.sh` copies the published `files[]` over
`node_modules/@abap2ui5/linter`; the linter's own runtime deps stay hoisted in
the consumer, so no second install is needed):

| Job | What it catches |
| --- | --- |
| `samples-controls corpus (280 ports)` | a rule that starts firing on real ports — run through `view-gates.mjs`, so corpus policy (POST_171 deviations, declared skips, advisories) applies and only a genuine regression fails |
| `vscode-extension typecheck` | a renamed or reshaped export — the extension imports the subpath exports against hand-written typings in its `src/linter.d.ts`, which nothing here would otherwise exercise |

A red downstream job is **not automatically a defect in the change**: a new
rule that fires on the corpus may well be right. It means the rollout has to
be decided — severity, an advisory period, or a corpus fix — rather than
landing unseen. Two traps worth knowing before reading a result:

- **Severity is not the whole story.** `view-gates.mjs` neutralises some rules
  by *type* (`ADVISORY_TYPES`), so raising one of those from `hint` to `error`
  changes nothing downstream. Conversely a **renamed rule id** is a silent
  breaking change: the consumer matches `VERSION_TYPES` and its sidecar
  deviations by type name, so a rename un-excuses every finding that name
  covered (renaming `member-too-new` fails 68 ports).
- The corpus exercises only a fraction of the rule set — as of this writing
  just six finding types fire across all 280 ports. A green corpus job means
  *no regression*, not *the new rule is covered*.

## Related repositories

| Repository | Relation |
| --- | --- |
| [samples-controls](https://github.com/abap2UI5/samples-controls) | Origin of the gate logic; now consumes this package via `scripts/view-gates.mjs` (git npm dependency) |
| [ai-mcp](https://github.com/abap2UI5/ai-mcp) | `validate_view` imports the linter **through the package exports map** (its `importViewCheck` resolves `.` and the subpaths) — a removed or renamed `exports` entry breaks it; the file layout under `lib/` is free to move as long as `exports` stays intact |
| [vscode-extension](https://github.com/abap2UI5/vscode-extension) | Consumes the SHA-pinned package (property gate) and the runtime `render-gate-bundle` download |
| [abap2UI5](https://github.com/abap2UI5/abap2UI5) | Defines `z2ui5_cl_ui5_view_builder`, the builder whose chains `lib/reconstruct.mjs` re-executes |
