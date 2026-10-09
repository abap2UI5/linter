# abap2UI5 linter

**Validate abap2UI5 app classes without an SAP system** — a CLI, library and
GitHub Action extracted from the CI gates of
[samples-controls](https://github.com/abap2UI5/samples-controls), where they
guard its generated ports of the official UI5 demo kit samples (how many is in
that repository's [STATUS.md](https://github.com/abap2UI5/samples-controls/blob/main/STATUS.md) —
it grows weekly, and a number written down here is a number that goes stale).

It checks a **whole app class**, not just the XML it emits: the ABAP source and
the view it builds are validated together. The defects that matter most are the
ones living between the two — a bound attribute whose ABAP field does not
exist, an event argument the control never delivers — and no UI5 tooling can
see them, because the view only exists at runtime.

```sh
npx @abap2ui5/linter src
```

That is the whole of it: no install, no SAP system, no configuration. ~340 kB
and no dependencies, so the line above is a fast one.

```
src/zcl_my_app.clas.abap
  36:14  error  sap.m.Page has no aggregation contentt - typo?                       unknown-aggregation
  40:22  error  sap.m.Button type="Emphasised" is not a valid value (allowed: ...)   invalid-property-value
```

Then, when you want it to stay green:

```sh
npm install -D @abap2ui5/linter                     # pin it for CI and for your machine
npx --no-install abap2ui5lint --init                # write a commented abap2ui5lint.jsonc
npx --no-install abap2ui5lint src --all-classes     # every class: the ones that build no view get the source-side rules
npx --no-install abap2ui5lint src --watch           # run, then re-run on every save - the loop for Eclipse ADT + abapGit
npx --no-install abap2ui5lint --explain unknown-control   # what a reported id means, with the before/after pair - in the terminal
```

`--no-install` is deliberate: `abap2ui5lint` is the command the package
installs, not a package name, and a bare `npx abap2ui5lint` run where the
package is NOT installed would download whatever is published under that name
on npm. Without an install, use the scoped `npx @abap2ui5/linter …`.

## Documentation

**→ [The linter, in full](https://abap2ui5.github.io/docs/advanced/linter.html)**
— the two gates and what each one catches, `--screenshot`, `--fix`, waivers,
the baseline for adopting it on a codebase that already exists, the config
file, the GitHub Action, the badges and the library API.

**→ [Rule reference](https://abap2ui5.github.io/linter/)** — every rule id with
the paragraph explaining what it means and why it exists. The id printed at the
end of a finding is the anchor.

Two more entry points, for the two other ways in:

| | |
|---|---|
| [Adding the render gate](https://abap2ui5.github.io/docs/advanced/linter.html#the-render-gate) | `npm i -D @abap2ui5/linter-render` + `npx playwright install chromium` — the headless `XMLView.create` that catches a view which fails to *load* |
| [Starting a project](https://github.com/abap2UI5/app-template) | app-template ships the CLI, the config and the workflow already wired up |

## Portable apps (opt-in)

An abap2UI5 app runs on the UI5 frontend whatever it writes. To keep it
renderable by **non-UI5 frontends** as well — the UI5 Web Components frontend
([frontend-webcomponent](https://github.com/abap2UI5/frontend-webcomponent)),
an Adaptive Cards renderer, an agent — ask for the `portable-app` rule:

```jsonc
// abap2ui5lint.jsonc
{
  "rules": { "portable-app": "error" }   // or "warning" / "hint"; off by default
}
```

It reports everything outside the abap2UI5 protocol's
[portable profile v1](https://github.com/abap2UI5/protocol/blob/main/profiles/portable.md):
controls and members it does not list, `z2ui5.cc` custom controls, named
models and other binding forms, expression constructs outside its grammar
(`RegExp`, `odata.*`, …), event arguments such as `$event`, frontend actions
such as `CONTROL_BY_ID`, and the nested view slots (`nest_view_display( )`).
Each finding names the reason; the [rule card](https://abap2ui5.github.io/linter/#portable-app)
lists them all. The profile is a verbatim copy of the protocol's
`profiles/portable-v1.json` in `data/` (its source commit beside it),
refreshed with `npm run sync-portable-profile`. One class opts out with
`" abap2ui5lint-disable portable-app` at its top, a path with the rule's
`exclude` list.

## Legacy-free code on an old target

`ui5` is the release your system runs, and a deprecation is reported once it
is in effect there — right for "will this break", silent about "is this
legacy". An app held to 1.71 so that it runs on old systems can still be
measured against SAP's legacy-free baseline with a second bound:

```jsonc
// abap2ui5lint.jsonc
{
  "ui5": "1.71",
  "deprecatedAt": "1.136"   // or --deprecated-at 1.136
}
```

Everything deprecated after the target and up to the horizon — controls,
their properties and events, and native XHTML/SVG markup — is then a
[`deprecated-after-target`](https://abap2ui5.github.io/linter/#deprecated-after-target)
hint that names the replacement and says whether your target already has it
(`sap.m.MessagePage` → `IllustratedMessage`, which needs 1.98: keep it until
the target moves). Every other rule still judges against `ui5`.

## Where it runs

The CLI, a GitHub Action (`abap2UI5/linter@v0`), and a library — plus two
consumers of that library:
[mcp-server](https://github.com/abap2UI5/mcp-server) exposes these gates as MCP
tools for AI coding agents, and the
[VS Code extension](https://github.com/abap2UI5/vscode-extension) surfaces the
findings as editor diagnostics while you type. All of them read the same
`abap2ui5lint.jsonc`, so the editor, the agent and CI agree.

## Used by

<!-- dependents:start -->
<!-- generated by scripts/generate-dependents.mjs — do not edit by hand -->

**11 public repositories** declare `@abap2ui5/linter` in a manifest — [GitHub's own list](https://github.com/abap2UI5/linter/network/dependents), refreshed here monthly:

- [abap2UI5-addons/layout-management](https://github.com/abap2UI5-addons/layout-management)
- [abap2UI5-addons/popups](https://github.com/abap2UI5-addons/popups)
- [abap2UI5-addons/rfc-connector](https://github.com/abap2UI5-addons/rfc-connector)
- [abap2UI5-addons/se16n](https://github.com/abap2UI5-addons/se16n)
- [abap2UI5-addons/selection-screen](https://github.com/abap2UI5-addons/selection-screen)
- [abap2UI5-addons/sql-console](https://github.com/abap2UI5-addons/sql-console)
- [abap2UI5-addons/table-maintenance](https://github.com/abap2UI5-addons/table-maintenance)
- [abap2UI5/abap2UI5](https://github.com/abap2UI5/abap2UI5)
- [abap2UI5/docs](https://github.com/abap2UI5/docs)
- [abap2UI5/samples](https://github.com/abap2UI5/samples)
- [NSSecat/09-26-abap2ui5](https://github.com/NSSecat/09-26-abap2ui5)

<!-- dependents:end -->

Only a **manifest** entry is counted here — that is what GitHub's dependency
graph can see. A repository that runs the linter through `npx --yes` or the
Action is a user, but never appears in this list.

## Working on this repository

```sh
npm ci
npx playwright install chromium   # the render runtime is an npm workspace here
node cli.mjs src                  # the CLI, from the checkout
npm test
```

`AGENTS.md` carries the conventions and what every gate checks;
`CONTRIBUTING.md` and `RELEASING.md` the rest of the workflow.

Four artefacts are generated and gated by `npm test`, so a stale one fails the
build:

```sh
npm run generate-metadata    # data/properties.json, from the @openui5 sources
npm run generate-schema      # data/abap2ui5lint.schema.json — editor completion
npm run generate-rules-page  # site/index.html — the published rule reference
npm run generate-compat      # data/compat.json — which abap2UI5 releases this linter line understands (the ./compat export)
```

Two further generators need network, so the suite cannot regenerate them and
the committed file is the contract instead; a scheduled workflow refreshes each
one and opens a PR with the diff:

```sh
npm run generate-icons       # data/icons.json — the SAP icon-font snapshot
npm run generate-dependents  # the "Used by" list above, from GitHub's dependents page
```

One file is vendored from another repository rather than generated, and is
refreshed by hand when the protocol moves (`npm test` pins its hash, the
weekly upstream-sync workflow reports drift):

```sh
npm run sync-portable-profile   # data/portable-v1.json — abap2UI5/protocol's portable profile (-- --local <checkout> to read a clone)
```

`site/` holds that generated rule reference (published to
https://abap2ui5.github.io/linter/), not documentation about this repository.

`experimental/github-app/` is a spike — a working prototype of the linter as a
hosted GitHub App, kept as documentation that happens to execute. It is **not
deployed, not registered, not shipped on npm and not supported**. The delivered
channels are the CLI, the library and the Action.

## Credits

The reconstruction, mock-model derivation, render harness and property gate
were built and battle-tested in
[samples-controls](https://github.com/abap2UI5/samples-controls)
against the official UI5 demo kit corpus — where `scripts/view-gates.mjs`
now consumes this package as the extraction of those original gates.
This package is the corpus-independent extraction.
