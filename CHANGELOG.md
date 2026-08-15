# Changelog

## Unreleased

- **A structure declared inside another one was dropped, and every path
  through it reported.** ABAP nests `BEGIN OF` freely:

  ```abap
  BEGIN OF ty_s_row,
    id TYPE string,
    BEGIN OF s_details,
      create_date TYPE d,
    END OF s_details,
  END OF ty_s_row.
  ```

  `s_details` names no `TYPE`, so the field matcher could not see it and the
  whole subtree vanished from the derived model — `{S_DETAILS/CREATE_DATE}`
  then read as *"the rows have no such field"* on correct code, with no way to
  act on it beyond a disable directive. Nested blocks are now lifted into
  structures of their own, at any depth, filed under a name qualified with
  their parent so two structures can each carry an `s_details`. Two false
  findings disappear from `abap2UI5/samples`; **nothing else in any corpus
  changes.**

- **A namespace prefix with a dot in it read as undeclared.** `xmlns:viz.data`
  and `xmlns:viz.feeds` are what the `sap.viz` controls are written with, and
  an XML prefix is an NCName, where a dot is perfectly legal. The declaration
  matcher used `\w`, so it saw no declaration and then reported every use as
  `undeclared-namespace` — four errors on one correct class.

- **An aggregation under a control the snapshot does not have was blamed on
  the nearest one it does.** The metadata covers OpenUI5; a SAPUI5-only
  control (`sap.ui.vbm`, `sap.ui.comp`, `sap.suite.*`) is outside it, and its
  children kept the last known ancestor as their owner. So `vos` inside
  `vbm:AnalyticMap` came out as *"sap.m.Page has no aggregation vos"* — a
  finding pointing at a control that is not the one in question, which nobody
  can act on. `abap2UI5/samples-stack` had excluded a whole package to silence
  the shape. Eighteen such findings across the sample corpora; **no finding
  anywhere else changes.**

  The mirror image was the worse half and invisible: an aggregation whose name
  happened to exist on that distant ancestor was silently *excused*. Both are
  guesses, and this rule's promise is that a chain leaving the snapshot is not
  guessed about — now the owner goes opaque and nothing below it is judged.

- **The rule reference showed code the builder cannot run.** Eleven of the 49
  examples on the rules page and in the README called `view->leaf( … )`,
  `)->open( … )` or `->_generic( name = … )` — the role names
  `lib/builders.mjs` uses internally, which were the verbs of a builder that is
  gone. The current one has `ele`, `tag`, `a`, `end`. Every example is now
  written in it, and a gate derives the allowed spellings from the builder
  definition itself, so a future rename takes the documentation with it rather
  than leaving it behind.

- **Every rule now has to fire in the test suite.** 83 of the 84 did;
  `escaped-brace-in-backtick` had no test of any kind, and nothing in the
  repository was in a position to say so — a rule that stops firing keeps a
  green suite, ships, and reports nothing until somebody notices by hand. The
  suite records the rule ids the checks actually produce and asserts the
  registry against them, so a new rule cannot land without a source that
  triggers it. `escaped-brace-in-backtick` got the four cases it was missing,
  including both correct spellings it must stay silent on.

- **`event-without-handler` reads `WHEN OTHERS`.** A dispatcher that ends in

  ```abap
  WHEN OTHERS.
    client->message_box_display( type = client->get_event( ) ... )
  ```

  handles every event there is, including the ones no `WHEN` names — and the
  rule read only the literals, so all five message types raised in
  `abap2UI5/samples` app 382 were reported dead. That is the expensive kind of
  finding: the reader has to prove the tool wrong before ignoring it, and the
  next real one is read the same way.

  Conservative on purpose in one direction: the CASE body is matched to the
  first `ENDCASE`, so a nested CASE hides the catch-all and the events keep
  being reported. Missing a catch-all costs a hint; inventing one would hide a
  genuinely dead event.

- **`abap2ui5lint --init`** writes a commented `abap2ui5lint.jsonc` to start
  from. The documented route was three steps — read the README, copy the
  block, fix the `$schema` path — and one of them was silently wrong: the
  README's `$schema` pointed at `main`, so an editor validated the file
  against rules the pinned CLI does not have, accepting what the run then
  refused. `--init` resolves it against the installed copy, and refuses to
  overwrite a file that is already there.

- **The README opens with the thing you came for.** `## Install` used to sit
  on line 165, behind ninety lines of rule catalogue; the run that needs no
  install at all now comes first, with the sample output it produces. The
  catalogue is unchanged, just no longer in front of the door. It also names
  [app-template](https://github.com/abap2UI5/app-template) — the repository
  that already has all of this wired up, and the answer for anyone starting a
  new project, which this README did not mention at all.

## 0.1.1

- **The advertised `npx @abap2ui5/linter src` lints again.** The render gate
  is on by default and its ~118 MB runtime is deliberately *not* installed by
  default, so the first command the README gives a new user did nothing at
  all: exit 2, no findings, a refusal naming the package to install. That was
  the state of 0.1.0 on npm.

  A render gate that nobody **asked** for now steps aside for the property
  gate and says so on stderr (`--json` on stdout stays parseable). Asking for
  it keeps the hard refusal, because a gate that silently does not run is how
  a green CI stops meaning anything — and asking is now writable from both
  sides: the new `--render` flag, or `"render": true` in `abap2ui5lint.jsonc`.
  `--no-render` is unchanged and silent.

- **`event-without-handler` reads two more handler shapes.** It knew
  ``check_on_event( `X` )``, ``get_event( ) = `X` `` and ``WHEN `X`.``, and
  called everything else no handler at all — so two shapes that are all over
  the corpora reported an event that IS handled:

  - ``WHEN `A` OR `B`.`` — only the first literal of the alternatives list
    was read, so the second name was reported dead (samples-stack app 319);
  - ``IF client->get( )-event = `X`.`` — the spelled-out form of
    ``get_event( ) = `X` `` matched nothing (samples-stack app 487).

  A false hint is the expensive kind: the reader has to prove the tool wrong
  before ignoring it, and the next real finding is read the same way.

## 0.1.0

First public release — of both packages, from one tag:

| Package | What it is |
| --- | --- |
| `@abap2ui5/linter` | the CLI, the library and the GitHub Action (~240 kB, no dependencies) |
| `@abap2ui5/render-runtime` | the UI5 runtime the render gate serves (`@openui5/*` + playwright) |

Everything below is what changed while preparing that release. Nothing was
published before it, so none of it can break an installed consumer — which is
exactly why these were worth doing now rather than later.

- **New rule `chain-house-layout`, and the first opt-in rule.** It judges a
  builder chain against one canonical form — one call per line *including
  attributes*, four spaces per level of the tree, the closing call in the
  column of the element it closes — and carries fixes, so `--fix` reformats.

  Its two neighbours judge a chain against itself and deliberately do not name
  a step, because demanding one lit up the corpus. That is still the right
  doctrine; what changed is the corpus. abap2UI5, abap2UI5/samples and
  abap2UI5/samples-controls were unified onto this layout, where the rule now
  reports nothing across all 575 builder classes — and on their previous state
  it reports 149 of 150 samples classes and 77 of 417 ports. Those 77 are what
  motivated it: their whole chain sat one level too deep, which
  `chain-indentation` cannot see, because a uniformly wrong rhythm is a rhythm.

  **It is off unless asked for** — `"rules": { "chain-house-layout": "warning" }`.
  A house style shipped as everyone's default is what `lib/chain-layout.mjs`
  argues against, and a whole-chain fix would defer any other rule's fix
  inside the same chain to a second `--fix` pass. The mechanism is general:
  `OPT_IN` in `lib/findings.mjs`, honoured before the rule is even emitted.

- **`./fix` is an export**, so a generator can format what it emits with the
  same code `--fix` runs rather than reimplementing the layout downstream.

- **The UI5 runtime moved into its own package.** It used to be declared as
  `optionalDependencies` of the linter, which does not mean what the name
  suggests: **npm installs optional dependencies by default**. So the
  advertised `npx @abap2ui5/linter src` — *"no install, one run"* — pulled 15
  packages and ~123 MB before it linted anything, and `--omit=optional`, the
  documented way out, is not a flag `npx` accepts. The runtime is now
  `@abap2ui5/render-runtime`, declared as an **optional peer**, which is the
  one kind npm leaves alone. A default install is 1 package.

  Adding the render gate is one command: `npm i -D @abap2ui5/render-runtime`.
  Without it every property-gate rule still runs, and asking for a render
  names that one package instead of listing twelve.

- **The render gate resolves through the runtime package.** `@openui5/*` and
  `playwright` used to be looked up relative to the linter itself, which finds
  them only because a flat npm tree hoists them to the top. Under pnpm and
  other nested layouts it would have called a complete install missing. Both
  lookups now go through `@abap2ui5/render-runtime` first and fall back to the
  hoisted tree.

- **One binary: `abap2ui5lint`.** `abap2ui5-linter` is gone as a command name.
  Two names for one tool means two things to document and two to keep forever;
  the surviving spelling is the one that matches the config file
  (`abap2ui5lint.jsonc`). Adding an alias later breaks nobody — removing one
  would have. The tool still calls itself `abap2ui5-linter` in reports and in
  the SARIF `tool.driver.name`: that is the product's name, not the command's.

- **The Action can skip the render gate.** `render: false` skips the runtime
  and the Chromium download and passes `--no-render`, which turns a
  property-only job from a ~123 MB install into a small one. It stays **on** by
  default, because switching a gate off silently would make findings disappear
  from a pipeline that still reports green.

- **`keywords` added** so the package is findable on npm at all.
