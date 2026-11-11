# Output — the report, the summary, and whose conventions it follows

The surface the CLI shares with ui5lint and abaplint on purpose, and what a run prints about itself. Read it before changing a formatter, a flag, the run summary, the progress line or a badge.

## Deliberate kinship with ui5lint and abaplint

The audience is the audience of [UI5/linter](https://github.com/UI5/linter)
and [abaplint](https://github.com/abaplint/abaplint), so the surface is
theirs on purpose and a change that drifts from it needs a reason:

| Ours | Modelled on |
| --- | --- |
| `path` heading, `line:col severity message rule-id`, `N problems (…)`, `Success! No findings detected.` — plus the rule's card URL after the id on every line, and `url` on every finding object: the one thing a log reader wants that ui5lint's format has no column for | ui5lint's stylish formatter |
| `--format stylish\|json\|markdown`, `--quiet`, `--version` | ui5lint |
| `--fix` plus a `*_FIX_DRY_RUN` env escape | ui5lint's `--fix` / `UI5LINT_FIX_DRY_RUN` |
| `abap2ui5lint-disable-next-line`/`-disable-line`/`-disable`/`-enable`, reason after `--` | ui5lint directives |
| `abap2ui5lint.jsonc`, `rules: { id: false \| severity \| { severity, exclude } }`, JSON schema for editor completion | abaplint's config and `BasicRuleConfig` |
| `site/index.html` — one searchable page, one anchor per rule id, and on every card whose reported snippet the linter reproduces inside a class, a link that opens that class in the playground (the playground's share-link format, written at generation time and verified: `playgroundLinks( )` in `scripts/generate-rules-page.mjs`). The frame hands the snippet the handle of a Page inside a View; `npm test` asks EVERY card both questions — the wrapped example fires the card's rule, the wrapped remedy does not — and names the six cards the frame cannot carry (the byte-level hygiene rules, the 256-column line, a setter bound only on a control newer than the default floor) with their reason in `UNWRAPPABLE` | rules.abaplint.org, the abaplint playground |
| bin alias `abap2ui5lint`, exit codes 0/1/2 | both |
| workflow-command annotations on the PR diff | abaplint's `actions-abaplint` |

Known deliberate divergences: severities are `error/warning/hint` (not
abaplint's `Error/Warning/Info` — `hint` is already load-bearing across
consumers), rule ids are kebab-case like ui5lint's rather than abaplint's
snake_case, and a corpus run adds the run summary below — neither reference
linter has one, because neither is usually pointed at a few hundred files
whose findings are all baselined. `--watch` is a third: neither reference
linter has one, because both live next to an editor that lints as you type.
This one's audience includes the Eclipse ADT developer who syncs through
abapGit and has no editor linter at all, so the CLI carries the loop itself —
the run again on every change to a checked file, the config or the baseline,
the config re-read each time, one warm browser across the runs when the
render gate is on, never a non-zero exit while watching (`watchLoop` in
`cli.mjs`; `test/review/watch.mjs` spawns a real one). It is refused with the
single-run modes and outputs (`--stdin`, `--screenshot`, `--fix`,
`--update-baseline`, the badge, SARIF and JSON files, any `--format` but
stylish), because each of those is a record of ONE run. `--explain` is a
fourth, for the same reader: both reference linters have a rules website and
an editor that shows the paragraph on hover, and this one's reader has a
terminal. `abap2ui5lint --explain <id>…` prints what `RULE_DOCS` holds for
each id (summary, detail, fix note, the before/after pair, the card's URL —
`formatExplain( )` in `lib/report.mjs`), with no id every rule id and summary
in the page's order (`formatRuleIndex( )`, over `ruleIndex( )`: the registry
plus `render-error`, category by category, alphabetical within one — the
order `generate-rules-page.mjs` writes), and an unknown id is exit 2 with the
one did-you-mean `lib/suggest.mjs` makes. It is a documentation command, not
a run: decided on the raw argument list before the option loop, so `--init`
cannot answer first, and refused with exit 2 together with a path or any
other option. And after a stylish report with findings, ONE line on stderr
names the command for the first three ids reported (`explainFooter( )`) —
only where stderr is a terminal, the way the progress line decides, never in
`--quiet` and never beside a machine format. `test/review/explain.mjs`
spawns the CLI for all of it.

The former test-coverage debt (`invalid-aggregation-child`,
`sapui5-only-control`, `open-levels`) is worked off — every rule now has an
assertion, and every rule id is gated against `RULE_DOCS` and the page
generated from it.

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
| **badges** — two shields.io endpoint JSONs: the corpus (`abap2UI5` grey \| `148 apps · 172 views · 2,176 controls` blue) and the verdict (`check-abap2UI5` grey \| `N rules passed` green, N being the registry minus what the repo switched off) | the files `--badge-corpus` / `--badge`, or config `badge` (a list, one entry per kind) | off |

Rules that hold for all three:

- **The numbers come from the walk the gate already did** (`profileTree` in
  properties.mjs, aggregated per result into `result.stats`). Nothing is
  re-parsed for the summary and nothing in it can fail a run.
- **`not judged` is the same point, one level down.** A binding path into a
  type the class does not declare (a DDIC structure, a type of another class)
  is not judged - "unknown" is not "missing" - and a corpus whose tables are
  all typed that way is clean because nothing was looked at. `checkNodes( )`
  counts the paths it asks about and the ones it could not answer (`tally`:
  `stats.paths`, `stats.pathsOpaque`), and the summary prints the line only
  where something was left unjudged.
- **`--timing` accounts, it does not benchmark.** It adds a `slowest` line
  (and `stats.timings` to the JSON document): every rule written as one unit
  under `rule:<id>`, the rules that still share a function under the pass
  they run in (`pass:lifecycle`, `pass:chain-layout`, …), and what
  `checkAbapRules( )` does outside every named pass as ONE entry,
  `pass:abap-rules (other)` - so the parts add up to the whole and a rule that
  has no entry of its own is visibly inside one, not free. The model of the
  class (`abap-model`) is built under its own entry, or the first rule to
  touch it would pay for it. A timed run skips the cache (a replayed verdict
  took no time). `lib/timing.mjs`; a new pass is one `timed( )` around its
  call.
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
