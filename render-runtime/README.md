# @abap2ui5/render-runtime

The UI5 runtime that the [abap2UI5 linter](https://github.com/abap2UI5/linter)
render gate serves — the `@openui5/*` source packages, `playwright` and the
theme compiler, bundled as **one** install instead of thirteen.

```sh
npm install -D @abap2ui5/linter @abap2ui5/render-runtime
npx playwright install chromium
```

There is no code here. This package exists only so that its dependency list can
be installed — or not installed — as a single decision.

## Why it is a separate package

The render gate boots a real `XMLView.create` in headless Chromium, which needs
a real UI5 runtime: ~118 MB of `@openui5` sources plus playwright — and, for
`--screenshot`, `less-openui5` to compile the themes those sources ship as
`.less` rather than as the `library.css` a browser asks for. The property
gate — every ABAP and view rule that resolves against the metadata snapshot —
needs none of it and is about 1 MB.

Those two lived in one package before, with the runtime declared as
`optionalDependencies`. That does not do what the name suggests: **npm installs
optional dependencies by default**, so the advertised

```sh
npx @abap2ui5/linter src            # no install, one run
```

pulled ~123 MB before it linted anything, and `--omit=optional` — the documented
way out — is not a flag `npx` accepts. Splitting the runtime out makes the
default install small and the render gate an explicit, single-name opt-in.

## How the linter finds it

`@abap2ui5/render-runtime` is declared as an **optional peer dependency** of
`@abap2ui5/linter`, so npm never installs it on its own — and, when it *is*
installed, npm holds it to the linter's declared range. That range lists the
release lines the linter has been verified against, and it is not advisory:
npm **refuses** an optional peer that is present and out of range, so a pairing
this package has not been built for fails at install time rather than at
render time.

The linter resolves the `@openui5` packages *through* this package when it is
present, rather than trusting them to be hoisted to the top of `node_modules`.
That is what makes the split work under pnpm and other non-hoisting layouts as
well.

When it is absent, the property gate runs exactly as before and a requested
render gate fails with one actionable message naming this package.

## Versioning

The pinned `@openui5` version is what the linter's metadata snapshot was
generated from, so the two move together: a linter release that regenerates the
snapshot gets a matching release here, and both are cut from one version tag.

**Prefer the same minor line.** What actually has to agree is the `@openui5`
version — a runtime older than the snapshot the linter was built against can
serve a control the gate then judges by metadata it does not have. Lines that
share those pins are interchangeable for the gate, which is why the linter's
peer range names every line it has been verified against rather than only the
newest one, and why an older line is not a defect to be broken out of.

What a newer line can add is capability rather than compatibility:
`less-openui5` (the theme compiler behind `--screenshot`) arrived after the
first releases. Without it a screenshot still comes back — unstyled — and the
render gate is untouched either way, because it asks for no stylesheet.
