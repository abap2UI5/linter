# Data — generated and vendored files under `data/`

What each file in `data/` is, who writes it and what gates it. None of them is edited by hand.

## `data/properties.json` is generated — never hand-edit

The 519 KB one-line snapshot (`ui5Version` 1.154.0, 980 controls, 246
enums) is generated from the installed `@openui5/*` packages (or
`OPENUI5_DIR`) by:

```bash
npm run generate-metadata
```

What a reader may rely on about its shape (the generator's header comment is
the authority): every control has a `parent` — the one real root,
`sap.ui.base.Object`, has no entry and `chainComplete( )` knows it by name;
every aggregation and association carries a boolean `multiple`, resolved the
way `ManagedObjectMetadata` resolves it (an aggregation saying nothing is
0..n, an association saying nothing is 0..1); `members` maps DECLARED members
to their `@since` and nothing else — an event parameter's version sits under
`events.<name>.params`; a parameter the class passes to `fire<Event>({ … })`
without declaring it is listed there too, flagged `fired: true`; and a
`deprecated.since` of `null` means the text names no release, not that the
reader missed a spelling. `enums` holds an enum's RUNTIME values — what
`isValid( )` tests, so what a setter and a bound value must carry — and
`enumKeys` holds `{ "<value>": "<key>" }` for the eight whose key differs from
it, which is the spelling an XML VIEW has to write instead (an attribute goes
through `parseValue( )`, key → value, before it is validated); an enum absent
from `enumKeys`, which is 227 of the 235, spells both the same. `typePatterns`
holds `{ "<type>": "<regex source>" }` for every string-based DataType whose
`isValid( )` is ONE regex test (`sap.ui.core.CSSSize`, `CSSColor`, `GridSpan`,
…; a body doing more than one test is left out), and `modelTypes` holds the
classes of `sap/ui/model/type` and `sap/ui/model/odata/type` — directories no
library path covers, read for this section alone — with their class-level
`since` where the JSDoc carries one. Thirdparty bundles under the library paths are not
walked (sap.ui.integration ships a minified copy of a dozen core classes) and
example code in JSDoc is not a class. `node scripts/generate-metadata.mjs
--parse <files> --base <module/path>` runs the parser over synthetic sources,
which is how `test/review/gen.mjs` pins all of that.

Regenerate it **only** when bumping the `@openui5/*` pins — which live in
**`linter-render/package.json`**, the workspace, not in the root manifest
(`RELEASING.md` step 1c is the authority; see the linter-render section
below) — or when the generator itself changes shape, and commit both together. The
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
Bumping is one PR: the pins in `linter-render/package.json`, `npm install`,
`npm run generate-metadata`, `npm run generate-icons` (needs network — the
icon snapshot is generated at the same release and `npm test` pairs the two),
and the snapshot header numbers above. A Dependabot bump does this to itself:
`.github/workflows/dependabot-openui5.yml` regenerates both files onto the
branch, because the pins and the data are one change.

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

## `data/compat.json` — the ecosystem compatibility record

Three versions are pinned independently across the ecosystem and nothing
tied them together: the framework release an app runs on (app-template pins
`1.144.0`), the linter version it installs, and the UI5 release the snapshot
above was generated at. `data/compat.json` is the linter's statement about
that: `linter` (package.json's version), `framework.minimum` (the oldest
abap2UI5 release whose released client API the rules assume — 1.144.0, the
first with `z2ui5_cl_ui5_view_builder` and `client->get_event( )`; `1.142.0`
has neither), `framework.mirrored` (the release the hand-maintained mirrors
in `lib/` and `test/fixtures/cs_event.intf.abap` were last synced against),
`ui5.floor` and `ui5.snapshot`. Exported as `./compat`, typed in
`types.d.ts`, read by app-template's `check-pin`/doctor and by the VS Code
extension.

It is generated (`scripts/generate-compat.mjs`, `npm run generate-compat`)
and gated like the schema: `npm test` fails while `linter` lags a version
bump or `ui5.snapshot` lags the metadata. Two numbers are decisions, not
derivations — `FRAMEWORK_MINIMUM` lives in the script and moves only when a
rule starts to assume a newer client API (say which rule in the CHANGELOG),
and `framework.mirrored` is read off an abap2UI5 checkout with
`-- --local <dir>` after a mirror sync and otherwise kept as committed, so an
offline regeneration cannot forget it.

## `data/abap2ui5-manifest.json` — abap2UI5's manifest of the mirrored sets

The four hand-maintained knowledge files (`lib/formatters.mjs`,
`lib/frontend-actions.mjs`, `lib/released-api.mjs`, `lib/cc-controls.mjs`)
mirror closed sets abap2UI5 defines. For a long time this repository FOUND
those sets by parsing abap2UI5 from the outside (`scripts/check-upstream.mjs`,
regular expressions over its generated `src/01/03` classes), which put the
knowledge of abap2UI5's layout on the wrong side: a module split there
blinded the parsers here, and when `ct_box_type` moved from
`z2ui5_cl_ui5_frontend` to `z2ui5_cl_ui5_srv_message` the script reported all
seven message box types as "gone upstream" while the mirror was right.

The direction is turned round:

- **abap2UI5 writes the sets down itself** — `.github/shared/linter-manifest.json`,
  generated from its real sources by its `generate-linter-manifest.mjs` and
  gated there (`check:linter-manifest`), so a set that moves fails the pull
  request that moves it.
- **The shape is `deriveUpstream( )`** in `scripts/check-upstream.mjs`
  (`MANIFEST_SCHEMA`; `readManifest( )` validates it). That function is the
  seam: finding the sets and comparing them with the mirrors used to be one
  body, and are two now.
- **`check-upstream` reads the manifest**: `--manifest <file>` explicitly, and
  by itself in the default (network) mode when abap2UI5's `main` publishes
  one — the weekly `upstream-sync.yml` needs no change for the switch. Where
  there is none it parses as before; `--local <checkout>` always parses (it is
  what abap2UI5's `check:mirrors` runs against a working tree), and
  `--emit-manifest` prints what the parsers find, the reference the generated
  file was held equal to when it was introduced (every set, 2026-11-11).
- **The copy here is `data/abap2ui5-manifest.json`** (`npm run sync-manifest`),
  and `npm test` runs `check-upstream --manifest` over it: mirrors and
  manifest are compared offline on every run, where the only comparison used
  to be weekly and over the network. Updating for an upstream change is
  therefore one move in two files — refresh the copy, then make the mirrors
  agree; the test names every set that does not.

What is NOT done: the mirrors are still written by hand. They carry more than
the sets (the reason a method is denied, the release a target needs, the
replacement an obsolete control names), so they cannot simply be generated
from the manifest; a mirror that is nothing but its set (`CURATED_FORMATTERS`,
`VIEW_SLOTS`, `FILTER_OPERATORS`) can read it from `data/` instead, and that
is the next step. The parsers stay until abap2UI5's `check:mirrors` runs on
the manifest too.

## `data/portable-v1.json` — vendored from abap2UI5/protocol, never hand-edited

The opt-in `portable-app` rule (`lib/portable.mjs`) judges an app against the
abap2UI5 protocol's **portable profile v1** — the subset of the view
vocabulary a non-UI5 frontend renders (abap2UI5/protocol
`profiles/portable.md`, normative; `profiles/portable-v1.json`, its
machine-readable list). The protocol repository is not a dependency, so the
JSON is **copied byte for byte** to `data/portable-v1.json` and its origin is
recorded beside it in `data/portable-v1.source.json` (`repository`, `path`,
`commit`, `sha256`):

```bash
npm run sync-portable-profile                          # protocol main, from GitHub
npm run sync-portable-profile -- --local ../protocol   # a checkout's HEAD (the file must be committed)
npm run sync-portable-profile -- --check               # compare only: 0 in sync, 1 drift, 2 unreachable
```

`npm test` (`test/review/portable.mjs`) recomputes the hash and names the
source commit in its assertion, so a hand edit of the copy fails the suite,
and the weekly `upstream-sync.yml` runs `--check` and opens its own drift
issue. A refresh is a reviewed change, not a chore: it moves the verdict of
every repository that switched the rule on — run the portable fixtures and a
real corpus before committing it.

**Read the profile as data, never restate it.** The rule takes the controls,
members, binding forms, expression grammar, event parameters, actions and the
client API from the JSON; the two things the JSON does not carry (the root
attributes `displayBlock`/`height`, and the server's mapping of
`POPUP_CLOSE`/`POPOVER_CLOSE` onto `VIEW_SLOTS destroy`) are the only ones
written in `lib/portable.mjs`. The protocol's decision **Q10** splits
`frontendActions` into the client-API names an app writes (`cs_event-…`,
what this linter reads) and the actions a frontend receives on the wire
(`ROUTER`, `HASH_BACK`, …); `clientApiActionsOf( )`/`wireActionsOf( )` read
both the pre-Q10 single list and the split shape, and a section of the test
pins every shape they accept. Decision **Q1** (NEST/NEST2 tolerated but not
rendered by portable renderers, so portable APPS must not use them) is the
`nested-view` reason.
