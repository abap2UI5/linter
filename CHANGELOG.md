# Changelog

## Unreleased

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
