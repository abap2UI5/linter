# test/sections — the suite's own sections, by topic

`test/run.mjs` holds the harness (`section`, `assert`, `tempDir`, the fixture
paths) and loads these modules in a fixed order, then `test/review/*.mjs`,
then the rule-coverage gate, then `late.mjs`. Until 2026-11 all of this was
one 7,000-line `test/run.mjs`; the modules are that file cut at topic
boundaries, unchanged.

Each module exports `default async function (H)`. `H` carries the harness,
the observed checks (`test/observe.mjs`) and every top-level name an EARLIER
module declared - the fixtures `fixtures.mjs` loads (`good`, `rules`,
`dumps`, …) are read by later sections - and a module hands its own top-level
names on with `Object.assign(H, { … })` at its end. A new section goes into
the module of its topic; a new topic that grows is a file in `test/review/`.

| Module | What it covers |
| --- | --- |
| `fixtures.mjs` | the load-bearing fixtures: good / viewbuilder / post171 / broken / structure, target version, distribution, the ABAP and view rule fixtures, rows, nested, model |
| `views.mjs` | namespaces, row and cell bindings, event parameters, structure of the tree, raw XML |
| `config.mjs` | `abap2ui5lint.jsonc`, the cache, the rules block, directives |
| `app-rules.mjs` | the app-level rules: display, popovers, obsolete API, public attributes, file collection, chain layout, the builders, released API, lifecycle |
| `render.mjs` | the render gate and its dependencies, formatters |
| `view-values.mjs` | enum keys and values, SARIF, baseline and the CLI |
| `data.mjs` | the upstream mirrors, metadata and icon snapshots |
| `fix.mjs` | `--fix`, flow rules and did-you-mean |
| `cli-output.mjs` | stdin, CI formats, the report, the run summary, the badge, the peer range |
| `artefacts.mjs` | everything generated or written down: typings, schema, compat, the rules page, AGENTS.md, line endings, workflows, used-by, the GitHub App |
| `robustness.mjs` | malformed input, the wire kinds, the abapGit round trip, hygiene |
| `late.mjs` | after the coverage gate: rule docs, the screenshot, prose and literals |
