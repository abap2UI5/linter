# Rule history — where each rule came from, and what it was measured on

History and rationale, round by round: read the part about a rule before you widen or narrow it. The open candidates and the rules of the trade for a new rule are in `docs/agents/roadmap.md`; this file only grows at its end, one paragraph or table per round.

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
| Untrusted text rendered through `a( v = … )` (the ui5-check entry that was "blocked on origin") | `unescaped-text-in-attribute` — the origin is read out of the class: every statement that writes the name, so a binding assembled in a variable stays silent and a value nothing assigns is data |

The last one shipped **narrower than it was written**: "no view binds it" is
not the same as dead. A PUBLIC attribute used only in ABAP code is state, not
ballast — PUBLIC is precisely how a value survives the roundtrip — so only a
name that appears once in the whole class, its own declaration, is reported.
Keep that distinction if the rule is ever widened. (It was widened on
2026-09-12, and as a SEPARATE rule for exactly that reason:
`unbound-public-attribute` reports the used-but-unbound half with the
remedy PROTECTED — the draft persists the whole object whatever the section,
only the MODEL filters on visibility — while `unused-public-attribute` keeps
saying "delete it". Two remedies, two rules.)

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
| pattern-lint `hardcoded-binding-path` (samples 456/457 human find) | `hardcoded-binding-path`, with the OData-entity-path exemption and, in `judge( )`, the stylesheet one: a value literal opening a `<style` tag is not judged, and a `{/` behind a backslash is never a path |
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
| the last two generic pattern-lint rules | `ui5-internal-access` (mProperties & friends, and the private Hungarian fields a client expression walks - `$event.oSource.sId` - fixed to their public getter where one is known; `checkPrivateUi5Fields( )`), `commercial-ui5-host` |
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
(`--update-baseline`, stale entries FAIL — since 2026-09-29 only an entry of a file the run looked at (linted, or under a path it walked and no longer collected), or of a file gone from disk, can be stale, and an update replaces those files' entries and keeps the rest; `--advisory` still exits 0; since 2026-10-12 the same holds when the walk collects nothing, and a run that names no baseline reads `abap2ui5lint-baseline.json` next to the config, which is where `--update-baseline` writes it by default), a page POOL in the render gate
(`openRenderer({ pages })`, `checkFiles` uses 4 — the corpus render wall
clock divides accordingly), and `scripts/check-upstream.mjs` +
`upstream-sync.yml`, the weekly drift gate for the two hand-maintained
knowledge files below.

The 2026-08-11 round mined the SAMPLES repo's ~1000-commit history and the
framework's frontend JS for silent-failure boundaries the earlier rounds had
not touched:

| Origin | Rule |
| --- | --- |
| the framework gained `_bind` parameters the reconstructor did not know — an `omit_initial_paths`/`json` bind DROPPED its attribute from the reconstructed view, blinding every gate to it | `bindingOf` now parses named args; shape-neutral params (`omit_initial`, `omit_initial_paths`, `json`, `view`) reconstruct as the plain binding, shape-CHANGING ones (`custom_mapper`, `switch_default_model`) still stay unresolved on purpose. **`tab`/`tab_index` left that list in 2026-08-29**: the cell binding's path IS computable (`val = t[ n ]-field` → `/T/(n-1)/FIELD`), and leaving it unresolved was the same blindness one row up — see the CHANGELOG entry for the consistency conditions |
| samples-controls porting guide: round-trips are serialized, an event in flight DROPS the ones behind it (measured on app 280) | `live-event-roundtrip` — a `liveChange` wired to `client->_event( )`; hint, 5 deliberate demo wires on the corpus, all advisory |
| samples history: one sweep replaced hand-rolled init flags in 111 classes (`7b210d1`), and the antipattern kept reappearing for years | `manual-init-flag` — only the unambiguous shape (flag-gated branch that BOTH sets the flag AND displays a view); a lazy-load guard that displays nothing is left alone |
| samples history: `_bind( )` on a `TYPE REF TO` attribute throws at runtime, found twice by users hitting the exception (`ca9d86d`, `8d477fe`) | `binding-to-reference` — only an OBJECT reference (a class or an interface); a data reference is a valid `_bind( )` argument since abap2UI5#2986, and `ref->*` and plain data attributes stay silent |
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
is the first rule that adds findings to every corpus at scale — when it
shipped it was one finding per class across every corpus there is (hundreds on
`samples` and on `samples-controls`, none on `app-template`, which had no
navigation to lose). Those counts are **not** kept here as standing numbers,
for the reason the corpus-size line at the end of this file gives: the
`app-corpora` matrix in `downstream.yml` runs the property gate over `samples`
and `app-template` on every push and prints the per-rule table into the job
summary, and the samples-controls corpus job does the same through
`view-gates.mjs`. Read the number off the run, not off this paragraph.
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
| `abap-check` §1, `abap2UI5/samples#669` — over-length lines left two demo classes as EMPTY STUBS after an import that reported the error and carried on | `source-line-too-long` (error, 255 chars). Not a view rule, deliberately: for a consumer repo whose only gate is `npx @abap2ui5/linter`, a class that cannot be imported is the most severe thing this tool can find |

`data/icons.json` is the round's new knowledge file, and the first one built by
**scanning history** rather than one snapshot: `scripts/generate-icons.mjs`
packs the `@openui5/sap.ui.core` registry of every minor from 1.71 to the
pinned version (81 releases) and records, per icon, the release it first
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
| the bundled companion controls a view can name declaratively (`<z2ui5:MultiInputExt …/>`) exist only in `app/webapp/cc/*.js`; the harness has to KNOW a control class before it can create a view naming one | `lib/cc-controls.mjs`, the fourth hand-maintained mirror — metadata only, the harness script is generated from it, gated by `check-upstream` (and since 2026-09-27 also the property walk's metadata for those controls - see below) |
| (2026-09-27) the eight companion controls whose source carries `// OBSOLETE: replaced by …` (Timer, Focus, Scrolling, Title, LPTitle, Favicon, Info, History) must never be used — a project decision for the whole ecosystem | `obsolete-custom-control` (error, no fix) + an `obsolete` block per entry in `lib/cc-controls.mjs` — see below |

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

`obsolete-custom-control` is a mirror with a gate rather than a generated
data file, and on purpose: abap2UI5 is not a dependency here, `npm test` has
no network, and every other closed set read out of that repository lives the
same way — hand-maintained in `lib/`, compared weekly by `check-upstream`.
The list is the `obsolete` block of the `CC_CONTROLS` entries, and
`check-upstream` compares it three ways: the marked set against the
`// OBSOLETE:` headers of ALL of `app/webapp/cc/*.js` (both directions), each
header's snake_case API names (`cs_event`, `start_timer`, `s_device`,
`hash_set`, …) against the replacement the finding writes, and each control's
helper against `src/99/z2ui5_cl_xml_view_cc` (`_generic( name = … ns =
\`z2ui5\` )`). Two decisions worth keeping:

- **The obsolete controls are MIRRORED in the render harness**, not left out.
  They still ship and still work, so a view naming one creates on a real
  system and must create here: before they were mirrored, a `<z2ui5:Timer>`
  was a module-404 `render-error` (samples-controls' demo_004 had it excused
  by file), which read like a broken view instead of a retired API. The rule
  is now the one message, and it names the replacement.
- **An error, by project decision** — the view still renders. Nothing in
  `SEVERITY_BY_TYPE`'s "the app breaks" sense is true; what is true is that
  the ecosystem's rule is "never", and a warning slips through every gate
  that fails on errors only. No fix: the replacement moves the job from the
  view into the class, usually another method on another roundtrip.

Measured 2026-09-27 on origin/main: 0 findings on samples (129 files),
samples-stack, popups, sql-console, table-maintenance, config-management and
app-template, while the companion controls those corpora DO name
(FileUploader, MultiInputExt, Storage, Tree, Websocket, …) stayed silent; 1
on samples-controls (demo_004's carousel Timer, removed on its open branch
together with the render-error exclusion); 1 on abap2UI5 without its config
(`src/99/02/z2ui5_cl_pop_file_dl`, frozen) and 0 with it (`ignore:
["/src/99/"]`).

Later the same day the mirror became COMPLETE, and the property walk started
reading it:

- **Three live controls had no mirror**: InputExt (a `sap.m.Input` with an
  `inputMode` property), UploadSetExt and SmartMultiInputExt (invisible
  Controls that find their UploadSet / SmartMultiInput by id - not
  subclasses of it). A view naming one was a module-404 `render-error`, and
  abap2UI5/samples (516, 517, 530) and samples-stack (319) excused them by
  file. `check-upstream` could not see it: it walked the mirrored names. It
  now also compares that list with every `app/webapp/cc/*.js`, and each
  mirror's EVENTS and the class it EXTENDS, not only its properties - the
  base is what brings `value`, `placeholder` and `submit` to an InputExt.
  A mirror may name the renderer module upstream uses (`renderer`), so
  InputExt renders as the Input it is.
- **A mirrored companion control is judged, not looked away from.**
  `CC_METADATA` turns each mirror into a snapshot-shaped entry with the base
  as its parent, and `checkNodes( )` layers it over the snapshot
  (`withCompanionControls( )`, inside the walk, so the VS Code extension's
  self-assembled pipeline gets it too): `<z2ui5:InputExt inputmode="…">` is
  an `unknown-property` with the `inputMode` did-you-mean, an Input member
  newer than the floor on it is `member-too-new`. A z2ui5.cc control nobody
  mirrored (a customer's own) keeps the old foreign-namespace treatment.
  The exported helpers that take `data` (`collectEnumBoundFields`,
  `propertyDecl`, `memberSection`) still see the bare snapshot: a companion
  control is unknown there, which keeps the ABAP-side rules built on them
  silent on it.
- **Measured**: all eleven corpora (samples-controls, samples,
  samples-stack, abap2UI5 src and node/srv, rap-ext, popups, sql-console,
  table-content-loader, table-maintenance, app-template) byte-identical
  under the property gate with the walk judging the companion-control tags
  they carry, and samples-controls' `view-gates.mjs --strict --no-render`
  (the downstream corpus job) prints the same verdict; samples 516, 517 and
  530 render clean (their exclusion now draws the stale-waiver note), and
  samples-stack 319 moves on to the SAPUI5-only `sap.ui.comp`
  SmartMultiInput it pairs its companion with, which the OpenUI5 harness
  cannot serve - so samples-stack's `/src/02/` exclusion stands, for the
  reason its comment already gives.

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

The 2026-08-30 round worked the staging areas off in one pass — the two
skills in abap2UI5 that are written as this linter's inbox, the corpus gate's
remaining generic checks, and the frontend's last unmined closed sets:

| Origin | Rule |
| --- | --- |
| `CONTROL_METHODS` declares ARITY and arg KINDS, and only two projections of it were mirrored | `control-call-arg-count` (castArgs slices the excess away), `control-call-arg-kind` (`int` runs through `Number( )`, `bool` is `X`/`true` and nothing else) — the whole map is `CONTROL_METHOD_KINDS` now, and `CONTROL_METHOD_ID_ARG` is derived from it rather than retyped |
| four GLOBAL_TARGETS are resolved with a LAZY require so a missing module cannot 404 the component — which makes them silent below their release | `frontend-action-too-new`, the version half of the wire family (`member-too-new` judges what the VIEW writes; nothing judged what the class SENDS) |
| `resolveControl` accepts `<id>/<aggregation>/<index>`, and only the head segment was judged | `invalid-aggregation-item` |
| four small closed sets nothing had mined: `URL_POLICIES`, the ScrollIntoView enums, the HTML `inputmode` set, `InvisibleMessageMode` | all through the existing `ACTION_ARGS` / `invalid-frontend-action` mechanism — the announce mode is read from the SNAPSHOT's enums rather than retyped as a fourth constant |
| `SET_NAV_ROUTING` / `SET_PUSH_STATE` / `SET_APP_STATE_ACTIVE` are consumed by the SERVER and queue no action, so they are absent from the dispatch table BY DESIGN | `SERVER_EVENTS`, and `cs_nav_mode` as the `set_nav_routing` argument set |
| `z2ui5_if_client` marks `_bind( view = )` "obsolete - inactive, not passed on internally" and the mapper pair "obsolete - still evaluated" | `obsolete-bind-argument`, with a deleting fix for the inactive half only |
| the app guide's predicative-call rule, and its "the fork decides nothing" rule | `lifecycle-is-initial`, `redundant-init-display` |
| samples-controls' e2e work isolated a PRIVATE instance attribute as an every-roundtrip ASSERTION_FAILED | `private-app-attribute` |
| a `backtick` literal has no escape processing, so a `\n` in one renders as two characters | `escape-sequence-in-backtick` |
| the metadata harvest (`defaultValue`, `setterMin`, `widensAggregation`) | `validating-setter-out-of-range`, `absent-boolean-overrides-default` |
| the activation traps `abap-check` had filed as `Gate: open` | `value-header-default-reassigned`, `into-corresponding-inline-decl`, `class-constructor-visibility`, `redundant-conv-i` — the `source-line-too-long` precedent, for a consumer whose only gate is `npx @abap2ui5/linter` |

Three things in that round are worth keeping in mind, and all three came out of
the corpus run rather than out of the design:

- **`statement-too-long` was written, measured and DELETED.** The candidate is
  real — a 246-row `VALUE #( )` constructor once could not be imported at all —
  but a character count cannot decide it: a builder CHAIN is one statement by
  construction, so the corpus's median over-limit statement was 23,000
  characters and its longest 253,000, and every one of those 156 ports imports
  fine. Length is not the discriminator, and no other signal was available.
  This is the doctrine below working exactly as written; do not re-propose it
  without a threshold somebody has measured.
- **The URLHELPER payload is judged by SHAPE, not by `JSON.parse`.** The corpus
  writes it as a JS OBJECT LITERAL (`|\{ URL: 'http://x', NEW_WINDOW: true \}|`
  — unquoted keys, single quotes) which the backend converts on the way out,
  so strict JSON reported nine correct wires and no defect. The two things that
  ARE decidable without a parser are whether the value is an object at all and
  which keys it names, which is what the rule asks now.
- **A `$`-prefixed argument is resolved CLIENT-side**, so its ABAP text is not
  the value the control receives. The id rules already knew that; the new kind
  check had to learn it, on one corpus port.

And one reconstructor fix that the stale-path work turned up, which matters more
than any single rule in the round: **`DATA t TYPE STANDARD TABLE OF ty WITH
DEFAULT KEY.` did not parse.** The declaration is anchored on its terminating
dot and only `WITH EMPTY KEY` was allowed before it, so the commonest spelling
in ABAP fell through to the SCALAR branch — the model carried `''` where a row
array belongs, no template row existed, and every rule that resolves against a
ROW went silent. A blind spot takes a whole family down without a word, which is
why it outranks the rules it was found under. SORTED and HASHED tables were not
recognized as tables at all and are now.

Two consumer-facing defects were fixed in the same round, both reported by a
config file rather than by a finding: `properties: false` used to take the
chain-layout family and every ABAP-side rule with it (a layout-only run passed
everything and looked green), and `commercial-ui5-host` reported a demo-kit
hyperlink and a `/test-resources/` image, which is what made every SAPUI5-facing
consumer switch it off wholesale and lose the one case it exists for. It is
scoped to a RUNTIME load now.

The 2026-09-12 round took the five checks samples-controls's `pattern-lint.mjs`
still carried that are NOT corpus policy — each rests on a fact about ABAP,
ABAP Doc, the framework or this linter's own reconstructor — plus four view
rules nothing had asked for yet, and closed the one duplicate the corpus gate
kept only to know a dispatcher shape:

| Origin | Rule |
| --- | --- |
| pattern-lint `unbound-public-attribute` (38 attributes in 23 ports moved on 2026-09-11) | `unbound-public-attribute` — a warning; the doc says why it is not a widening of `unused-public-attribute` |
| pattern-lint `default-key-table` (slipped abaplint's `default_key`, which sees only the EXPLICIT form; app 034) | `default-key-table`, in `checkAbapHygiene( )` |
| pattern-lint `abapdoc-html-tag` | `abapdoc-html-tag` — over the RAW source, with the ABAP Doc markup tags exempt (pattern-lint's regex excluded them by accident: a tag with an attribute has a space) |
| pattern-lint `event-arg-default-index` | `event-arg-default-index`, a hint with a deleting fix — `v TYPE i DEFAULT 1` is the signature |
| pattern-lint `client-handle-capture` (a human decision, apps 005/053/007) | `client-handle-capture` — it turned out to be a LINTER fact, not taste: a captured handle is a runtime value to the reconstructor, so the attribute written from it is dropped from every gate's view of the class with no finding at all (measured: `DATA(lv_b) = client->_bind( mv_text )` then `v = lv_b` reconstructs `<Input/>` without its value). A warning for that |
| pattern-lint `dead-event-wire` — a duplicate of `event-without-handler` kept only because it knew the IF-shaped dispatcher | `event-without-handler` already read `IF client->get_event( ) = …`, `ELSEIF` and `OR` (the comparison is found wherever it stands); what it did NOT read were the operator spelled `EQ` and the literal on the LEFT, both taught now with a fixture per spelling, so the duplicate can be retired downstream |
| the mirror nobody had written of `undeclared-namespace` | `unused-namespace-declaration` — tag AND attribute prefixes, the default `xmlns` never; `--fix` only where the `a( )` call has its line to itself |
| ported samples whose CSS file was not ported with them | `undefined-css-class` + `lib/css-classes.mjs` (the UI5 prefix families, harvested from the OpenUI5 sources — 5,148 distinct class tokens, of which sapM/sapUi/sapF/sapUxAP/sapTnt cover 5,069) |
| an abap2UI5 app is ONE page | `external-link-without-target` — a same-window navigation replaces the runtime, every view and the session |
| every system but a laptop serves https | `insecure-asset-url` — the `http://` sibling of `relative-asset-url`, error where the browser BLOCKS the load (mixed content), a per-finding `hint` for a hyperlink |

Measured on the samples-controls corpus (637 classes) before shipping: 92
classes `unused-namespace-declaration`, 15 `undefined-css-class` (app 345 is
the "carries a stylesheet that defines OTHER tokens" case: its `<style>`
defines `.exampleDiv` while eleven controls wear `gridWrapper`, a class the
original used as a jQuery hook), 3 `external-link-without-target`, 12
`insecure-asset-url` (11 `http://sap.com` hyperlinks as hints, one wikimedia
image as the error), 0 `default-key-table`, 0 `abapdoc-html-tag`, 0
`event-arg-default-index`. Two of the ports came back NON-zero where
pattern-lint said zero, and both times the port was right and the corpus gate
wrong: `unbound-public-attribute` found three (two of them excused by
pattern-lint because its model-path regex `/name/` had matched the attribute
name inside a COMMENT — this linter reads the scrubbed source — and one in
`src/03`, which that gate never judged), and `client-handle-capture` found
one in the generated overview app, `press = client->_event( … )` into a
declared local later written as `v = press` — pattern-lint matched only the
inline `DATA( )` form, and the assignment form drops the attribute exactly
the same way. `event-without-handler` reports five hints on the corpus, all
five pre-existing (the rule's code path for them did not change, and the
before/after runs are byte-identical) and all five deliberate roundtrip-only
wires — app 600 says so in a comment beside its `DRAG_START`.

The 2026-09-19 round drew the line the earlier rounds had only implied:
**a rule about ABAP as a language belongs in abaplint, not here.** The
pure-ABAP candidates of that round (a `REF #( )` into a generic target, a
`TYPE HANDLE` operand that is a call, `)->*` on 7.50, the generic-operand
traps of older releases, `INTO CORRESPONDING … @DATA( )` at v750,
`GET REFERENCE` under Cloud, the empty CATCH, the implicit default key, an
HTML tag in ABAP Doc, the file's last byte) went into abap2UI5's
`backlog/ABAPLINT.md` as paste-ready items, each measured on abaplint
2.120.52 first — and that measurement closed four the other way:
`class-constructor-visibility`, `value-header-default-reassigned` and
`boolc-instead-of-xsdbool` are `check_syntax` / `prefer_xsdbool` findings on
that version, and a test class without `LOCAL FRIENDS` is one too. They stay
here for consumers on older pins; do not add to that family. What shipped
here instead is what only an abap2UI5 reader can decide:
`handler-without-event`, `binding-to-expression`, `association-unknown-id`,
`column-cell-count-mismatch` (a fifth, `obsolete-event-constant`, was
withdrawn before release: abap2UI5 removed every constant under the
`"obsolete` label, and the label, three days later), six fixes on rules
that had none (`missing-on-navigated-branch`, `separate-lifecycle-ifs`, the
two section MOVES of `binding-to-nonpublic` / `private-app-attribute`,
`hardcoded-binding-path`, `external-link-without-target`) and the
did-you-mean on the closed sets that lacked it. Measured on abap2UI5's own
20 app classes and on app-template: 0 new findings, the existing 11
unchanged.

The 2026-10-01 round asked for three things at once — a faster gate, more
rules, more fixes — and kept the doctrine for each: every rule measured on
samples, samples-controls and abap2UI5 (**0 new findings and 0 changed ones on
all three**, so nothing fired on correct code), every rule checked to see
something by a fixture and, for the one with a corpus history, by injection.

| Origin | Rule |
| --- | --- |
| the server's own closed set: `box_resolve` lower-cases a box type and falls back to `show( )` on a miss | `unknown-message-box-type` + `MESSAGE_BOX_TYPES` / `MESSAGE_TYPE_LETTERS` in `lib/frontend-actions.mjs`, gated by `check-upstream` against `ct_box_type` in `z2ui5_cl_ui5_srv_message` (in `z2ui5_cl_ui5_frontend` until abap2UI5#2988) |
| `_bind_path( )` / `_bind( path = abap_true )` return the path WITHOUT braces, and the reconstructor (correctly) rebuilds the attribute as that text — so no view-side rule could see it | `bind-path-as-value`, read off the call; `t =` and `template:with path` are exempt |
| `sap.ui.core.HTML`'s own property doc: "the content must be enclosed in tags, pure text is not supported" (`new jQuery(content)` reads it as a selector) | `html-content-not-markup` |
| abap2UI5's `ui5-check` CSP entry ("a rule would flag `on*=` attributes and `<script` in a `core:HTML` `content`, and `javascript:` in any URL-typed property") | two more view shapes of `raw-javascript-to-frontend`, which already had the `<script>` one |
| abap2UI5's backlog item `navcontainer-position-not-reissued` (the one "ready to file"), and the comment at the `^set…` collector that said why it was a separate rule | `navigation-lost-on-rebuild` |

`navigation-lost-on-rebuild` was measured the way the backlog item asks: the
seven samples-controls ports that carry the remedy by hand (167, 301, 302,
303, 558, 578, 585) and the five it names as correct without one (096, 097,
242, 263, 565) are all silent; with the display-path navigation deleted, 301,
302, 303 and 585 are reported (167 and 578 navigate ONLY from the display
path, and 558 displays from its handler, so nothing is left to judge). The
discriminator is the backlog's: a bound field naming a page — the call
navigates to the field, the handler copies its target into the field, or a
literal the field holds is one of the container's page ids — and never "the
target is not a literal".

New fixes on rules that had none: `abapdoc-html-tag` (the brackets escaped as
`&lt;`/`&gt;`, the spelling `z2ui5_if_client`'s own ABAP Doc uses),
`control-call-arg-kind` (`abap_true`/`x` → `X`, `TRUE` → `true`, the false
spellings → `false`; `1` and `Y` keep the finding) and `duplicate-property`
(only where the second write REPEATS the first, compared as the call text;
two different values are a conflict the author settles). The reconstructor
now records the first write's offset on that finding (`firstOffset`) for it.
`boolc-instead-of-xsdbool` stays without one, as its card says: the two
functions differ in behaviour.

The speed half, measured on the samples-controls corpus (642 classes,
`--no-render`): 15.2 s → 10.7 s single-threaded, 6.6 s with the pool, all
three corpora byte-identical in `--format json`. What moved it:

- **The source readers were character loops building strings one `+=` at a
  time.** `scrub( )` returns a line without a `"` unchanged, `blankLiterals( )`
  and `splitStatements( )` jump between delimiters, and `namedArgMarks( )`
  reads `name =` in place instead of `argBody.slice(i).match( )` at every
  blank. `blankLiterals( )` also lost a length bug on the way: an unterminated
  template ending in a backslash grew the output by one character.
- **The same argument list was parsed again and again** — 233,000 reads of
  19,000 distinct bodies — so `namedArgMarks( )` is memoized like the
  statement splitter, and its marks are frozen the same way.
- **Quadratic scans**: `non-released-api` tested every match against every
  literal; `unused-`/`unbound-public-attribute` built one whole-class regex
  per attribute. Binary search and one alternation regex now.
- **`checkFiles( { jobs } )`** — a worker pool for the property gate
  (`lib/check-worker.mjs`). Every file is judged on its own once the class
  index exists, so the files are spread over threads and the results put back
  in FILE order: a pooled run returns what the sequential loop returns. A
  thread costs ~250 ms (module load, snapshot parse), so the pool starts one
  per 64 files; the CLI's `--jobs` defaults to the cores, at most 4 (the
  measured curve flattens after three). The library default stays 1, and
  options a thread cannot receive (a function) run sequentially. Nothing in
  the cache key: the verdict does not depend on it.

The 2026-10-03 round went back to abap2UI5's `ui5-check` skill, whose entries
had all moved or been ruled out (the binding-side enum rule twice, the
consumer-side module gate for lack of a JavaScript input), and took the half
of its "names a release does not have" and "views that fail to LOAD" sections
no entry had written down: the values and module names a VIEW carries that the
snapshot did not read yet.

| Origin | Rule |
| --- | --- |
| `sap/ui/core/library.js` checks every CSS-typed property with one regex, and `XMLTemplateProcessor` only LOGS a refused value — the control's `validateProperty( )` then throws and the view is never created (confirmed by the render gate: `Value '100 %' is not valid for type 'sap.ui.core.CSSSize'`) | `invalid-css-value` + the snapshot's `typePatterns`. The five CSS regexes are byte-identical in the 1.71.81 and 1.152 packages, so the snapshot's regex is the floor's |
| `ui5-check` §1.3 "modules": a binding type is a module, named by global name or through `core:require` | `unknown-binding-type`, `binding-type-too-new` + the snapshot's `modelTypes` |

Measured on origin/main of samples (140 files), samples-stack, samples-controls
and app-template, before and after: **0 new findings on correct code**, and 2
on samples-controls — `binding-type-too-new` on app 018's two
`DateTimeWithTimezone` bindings, the port of a 1.99 sample whose `showTimezone`
on the same controls is already a `member-too-new` it declares as `POST_171`.
Coverage, the other half of the doctrine: 2,053 CSS-typed literals and 153
model-type names judged in silence (1,067 of the literals are `100%`), and an
injected `width = '240'` / `100 %` / `sap.ui.model.type.Datetime` into real
ports is reported each time. Rollout note: samples-controls' `VERSION_TYPES`
has to learn `binding-type-too-new` (and `declares( )` to read its `value`,
where the type name is) at the pin bump, or app 018 fails strict.

One entry of the old candidate list that was closed in place:

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

The 2026-11-12 round went after the reconstructor's blind spots rather than
after a new defect class, because a blind spot takes every rule with it:

| Origin | Change |
| --- | --- |
| abap2UI5's own start app skipped from the render gate (6 builder calls "in helper methods") | a RETURNING helper with a multi-statement body is REPLAYED, and `DATA(x) = helper( … )` builds on the handle the body hands back - 182 -> 245 controls over abap2UI5's apps |
| the nested-view host of sample 338, and its simpler cousin | a handle a factory method leaves in an attribute is replayed in the method that stringifies it; an escape (field symbol, dynamic call) keeps the skip |
| sql-console skipped for `t->end( )` on a transaction | a call on a receiver typed or built as no builder is not a builder call |
| layout-management's popups, reconstructed for the first time, lit up 5 `unknown-binding-path` | a structure that INCLUDEs an undeclared type is an OPEN shape - the corpus caught the reconstructor, not the port |
| scope.md's "not modelled: branches inside the start path" | `enum-bound-to-conditional-field` (warning) |
| a `COND #( )` without ELSE was an `unresolved-attribute-value` hint, though the render gate shows `Value '' is not valid` | `enum-cond-without-else` (warning); the literal branches are judged |

Measured on samples-controls, samples, samples-stack, app-template,
abap2UI5 and seven abap2UI5-addons repositories: no new finding but the two
directives in abap2UI5's start app that excused the linter for not following
`create_layout_form( )`.

The second 2026-11-12 round worked the rest of that roadmap off:

| Origin | Rule or change |
| --- | --- |
| an installation is not abap2UI5's main | `abap2ui5` in the config, `abap2ui5-api-too-new` (error) over `data/abap2ui5-since.json` - 0 findings against 1.148.0 on samples-controls, 1,633 against 1.140.0 |
| abap2UI5's `ui5-check` entry "escapeHandler as an XML attribute is a string on 1.71", marked ready | `escape-handler-as-string` (warning, raw XML only) |
| the first rule over ANOTHER class | `nav-target-never-displays` (warning) - 26 nav targets judged in silence across samples, samples-controls, samples-stack, abap2UI5 and popups, all of which display |
| the raw-view half of the chain layout family | `xml-indentation` (opt-in hint) - silent on abap2UI5's frontend, the only hand-written raw views in any corpus |
| abap2UI5's `App.view.xml`, checked for the first time | `controllerName` and the resource-bundle settings of an XMLView root are no unknown-property |
| consumers spelling out the same intentions key by key | presets `abap2ui5:recommended`, `abap2ui5:strict`, `abap2ui5:adopt` as the base of `extends` |
| a rename was the one breaking change of its own | `lib/rule-aliases.mjs` |

`npm run fix-coverage` measured the fix question before any fix was written:
of 2,817 findings on samples-controls 113 carry one, and every rule that
fires there more than eight times without one needs a decision only the
author can make. No fix was added for the sake of the ratio.

The eval pack paid for itself the day it first ran (2026-11-12): two answer
sets written by two models with nothing in their context. One wrote the
frozen `z2ui5_cl_xml_view` twelve times - `frozen-view-builder` said so. The
other named the CURRENT builder and called the frozen builder's per-control
methods on it (`=>page( )`, `->input( )`), and the linter reported "no view
built" and nothing else: a class that does not activate, passed as a class
that merely displays nothing. `unknown-builder-method` closes it - 150
findings across those twelve answers, 0 on every corpus, after a first cut
that read handles class-wide reported a popup class's `lo_popup->result( )`
in abap2UI5-addons/popups (a handle is now scoped to its method).

