# Security policy

## Reporting a vulnerability

Please use the GitHub Security Advisory
["Report a Vulnerability"](https://github.com/abap2UI5/linter/security/advisories/new)
tab. Do not open a public issue for a security report.

Expect an acknowledgement within a few days. This project is developed
alongside other work, so a fix is agreed rather than promised by a date — the
advisory is where that conversation happens.

## Supported versions

Only the **latest published version** of `@abap2ui5/linter` and
`@abap2ui5/render-runtime` is supported. Both are still on the `0.x` line
(the rule set is growing, and a new rule can change a consumer's verdict), so
a fix ships as the next release rather than as a patch to an older line.

## What this package is, from a security point of view

Worth knowing before assessing a report:

- **It has zero runtime dependencies.** `npm i @abap2ui5/linter` installs one
  package and nothing else. The UI5 runtime the render gate needs is an
  *optional peer* (`@abap2ui5/render-runtime`), so it is installed only when
  someone asks for it.
- **It is published with provenance.** Releases go out from
  `.github/workflows/release.yml` through npm trusted publishing (OIDC), so
  there is no long-lived npm token in this repository to leak, and every
  published tarball carries an attestation linking it to the commit and
  workflow that built it. Verify with `npm audit signatures`.
- **The property gate reads source; it never executes it.** ABAP classes and
  XML views are parsed and reconstructed statically.
- **The render gate DOES execute code** — it loads the reconstructed view in
  headless Chromium against a local OpenUI5 runtime. It is off unless the
  runtime is installed, it loads no remote resources, and the model it renders
  with is derived from the class rather than fetched. Still: running the render
  gate over untrusted sources runs untrusted markup in a browser, so treat it
  the way you would treat any build step over untrusted input.
- **The composite Action passes every input through `env`**, never
  interpolated into a `run:` block, and `npm test` asserts that it stays that
  way. A workflow-injection report against that path is very welcome.

## Out of scope

- Findings *the linter reports* about your ABAP or your views — those are the
  product, not a vulnerability. Open an issue.
- A false positive or false negative in a rule. Also an issue.
