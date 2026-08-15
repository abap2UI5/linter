# Changelog

## 0.1.0

First public release — of both packages, from one tag:

| Package | What it is |
| --- | --- |
| `@abap2ui5/linter` | the CLI, the library and the GitHub Action (~240 kB, no dependencies) |
| `@abap2ui5/render-runtime` | the UI5 runtime the render gate serves (`@openui5/*` + playwright) |

Everything below is what changed while preparing that release. Nothing was
published before it, so none of it can break an installed consumer — which is
exactly why these were worth doing now rather than later.

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
