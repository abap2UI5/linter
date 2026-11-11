# Rule modules — what each file in `lib/` is for, and why

The notes behind the modules: what each one emits or provides and the decisions that shaped it. **Which rule is defined where is not kept here any more** — that is `rule-map.md`, generated from the registry (`npm run generate-rule-map`), so this file can say why without having to be complete. Read it when you work inside one of these modules.

## Rule taxonomy — where each finding type is emitted

A finding's `type` **is its rule id** — printed at the end of every reported
line, keyed in the config's `rules` block, nameable in a source directive and
offered by the JSON schema. The registry is `SEVERITY_BY_TYPE` in
`lib/findings.mjs` (exported as `RULES`); a type missing from it is not a
known rule and the config will refuse it. Emit sites (grep the id to find the
exact line):

| Emitting file | Finding types |
| --- | --- |
| `lib/properties.mjs` | `unknown-control`, `control-too-new`, `control-deprecated`, `deprecated-after-target` (the deprecation HORIZON: a deprecation that takes effect after the target and up to `deprecatedAt` — the option's whole effect, so with it unset the rule cannot fire; emitted beside `control-deprecated` and `member-deprecated` and for native markup, with the replacement the deprecation's `{@link}` names and whether the target has it — `replacementOf( )`; never fixed, since the replacement may not exist on the target), `native-html-in-view` (an element in the XHTML or SVG namespace, deprecated in an XMLView since 1.120 and logged there as a `[FUTURE FATAL]` — once per island of markup, on its outermost element; below a 1.120 target it is `deprecated-after-target` under a horizon and silent without one), `sapui5-only-control` (an error with `--distribution openui5`, a hint with no `distribution` configured, silent with `sapui5`), `deprecated-library` (the five libraries SAP deprecated WHOLE, which is the one thing here that cannot come from the snapshot: a library nobody should write any more is not in what the harvest reads, so a `sap.ui.commons` view was invisible rather than merely unjudged — and it stands the rule above it down, because a tag that has to be rewritten does not also need advice on the distribution it is kept under), `unknown-property`, `member-too-new`, `member-deprecated`, `event-parameter-too-new`, `unknown-event-parameter`, `invalid-property-value`, `unknown-aggregation`, `aggregation-in-aggregation`, `too-many-children`, `invalid-aggregation-child`, `duplicate-aggregation`, `missing-required-aggregation`, `duplicate-id`, `undeclared-namespace`, `invalid-expression-binding`, `binding-for-event`, `event-for-property`, `unknown-binding-path`, `collection-bound-to-property`, `binding-type-mismatch`, `enum-bound-to-initial-field` (the root-field twin of `enum-field-unset-on-insert`: an enum-typed property bound to an attribute the start path gives no value — no literal seed, no declared `VALUE`, no other write — so the first display ships `""` and the app terminates; judged only for a document the first display shows, against prepareAbap's `initModel`/`initialFields`, see **The start path** below), `json-bind-on-scalar-property`, `uncurated-formatter` (list: `lib/formatters.mjs`), `binding-on-association`, `unknown-model`, `event-on-disabled-control`, `raw-javascript-to-frontend` (view half - a `<script>` tag, an inline `on…=` handler in markup, a `javascript:` URL in a URI-typed property, classes only; the `follow_up_action` half emits in `abap-rules.mjs`), `missing-accessibility`, `aggregation-too-new` (the aggregation-TAG half of `member-too-new`, split off because UI5 resolves an unknown tag as a control class and the 404 kills the view), `toolbar-control-in-bar`, `relative-aggregation-without-context` (the aggregation counterpart of `relative-binding-without-context`), `json-literal-in-attribute`, `picker-value-without-format`, `relative-asset-url`, `date-type-without-source`, `enum-value-too-new`, `validating-setter-out-of-range` (the harvested `setterMin`: a property whose own setter refuses the ABAP initial 0), `unresolved-attribute-value` (an enum-typed attribute the reconstructor had to drop, so the one check that would have decided it went with the value; a `COND #( )`/`SWITCH #( )` with an `ELSE` whose every branch resolves is not dropped from the judgement - the reconstructor records its values as `branchValues` and `checkValue( )` judges each one like a literal), `insecure-asset-url` (the `http://` sibling of `relative-asset-url` in the same `checkValue` site — an error where the browser LOADS the URI, a per-finding `hint` where it navigates: `href` and the ObjectHeader's `titleHref`/`introHref`), `invalid-css-value` (a literal on a CSS-typed property - `CSSSize`, `AbsoluteCSSSize`, `CSSSizeShortHand`, `CSSColor`, `Percentage` - that the type's own regex refuses, judged in `checkValue( )` against the snapshot's `typePatterns`: the XML parser only logs it, the setter throws, the view is never created; a guessed value is not judged), `unknown-binding-type` and `binding-type-too-new` (a model type named by a binding info's `type:` or a `core:require` module path, against the snapshot's `modelTypes` — no such class, or newer than the floor; the require half is judged at the require, so an alias is never reported twice), `html-content-not-markup` (a `sap.ui.core.HTML` `content` that does not open with a tag: `new jQuery(content)` reads it as a SELECTOR - nothing renders, or the selector throws; the fix wraps plain text in a `<span>`, as entities in raw XML), plus the DOCUMENT-level pass `checkDocument( )` that runs once after the walk: `unused-namespace-declaration` (the mirror of `undeclared-namespace`, reading tag prefixes AND attribute prefixes — `core:require`, `app:type` — with a deleting `--fix` attached in `findings.mjs` only when the `a( )` call has its line to itself; it stands down in `check.mjs` (`standDownUnusedNamespaces( )`, exported on `./check`) where the reconstruction is known incomplete — `unplacedTokens > 0`, or a prefix the class writes in more builder literals than its documents carry, the RETURNING-helper shape of abap2UI5's `z2ui5_cl_ui5_app_start` — and a directive for it is then unjudged, `stoodDown` on `applyDirectives( )`), `association-unknown-id` (the other half of `binding-on-association`: a plain id no control of the document carries, judged against the document's literal ids and only when every id in it is one), `column-cell-count-mismatch` (a `sap.m.Table` whose row template has a different number of cells than the table has columns — mapped by index, nothing logged), `rows-hidden-by-visible` (a bound `items` of a non-growing `sap.m.ListBase` — no binding-info `length` — whose row template carries a binding-valued `visible`, in a class that raises no size limit — `sizeLimitRaised( )`, read by `check.mjs` off the source, null for a raw view: the hidden rows count against the JSONModel's 100, so the list stops short of its data; the narrow successor of the size-limit rule dropped in 0.3, see its CHANGELOG), `bound-aggregation-over-size-limit` (the third **opt-in** rule, `OPT_IN`: the general rule dropped in 0.3, back for an app's own code - a bound `items` of a non-growing `sap.m.ListBase`, a `Select` or a `ComboBoxBase` without a binding-info `length`, whose table the class is SEEN to seed past 100 rows: `seededRowCounts( )` in `check.mjs` reads the one literal seed's rows or the APPENDs of literal `DO n TIMES` loops, a lower bound, and only for a table nothing else may shorten; computed and handed to `checkNodes` as `seededRows` only when the rules block asks and the class raises no size limit. Opt-in because the port corpus it was measured on caps at 100 in the originals too), `bound-aggregation-without-template` (a bound aggregation with no child to clone — `bindAggregation` throws and the view never loads), `unknown-source-property` (the `$source>/name` twin of `unknown-event-parameter`, recorded by the reconstructor as `sourceParams`), `editable-control-without-binding` (an input whose value property is neither bound nor read back by an event — a hint, judged per family through `INPUT_FAMILIES`), `undefined-css-class` (a `class` token neither under a UI5 prefix in `lib/css-classes.mjs` nor defined by a `<style>` block the same document carries; a document whose stylesheet is unresolved is not judged), `external-link-without-target` (an absolute `href` with no `target` on the same element, prefixed pairs judged against their own `…Target`), `second-root` (a second element at the document's top level — the split chain after a standalone `factory( ).`, which the render gate rejected and the property gate never named), `malformed-xml` (a raw view that is not well-formed — a mismatched, unclosed or stray closing tag, a duplicate attribute — recorded by `parseXml( )` as `root.malformed` beside the lenient tree it keeps building, and reported by `checkNodes( )` so a consumer assembling the pipeline gets it too; `UNWRAPPABLE` on the rules page, since no builder class can write one), plus `obsolete-custom-control` (the view half: a tag whose prefix is BOUND to `z2ui5.cc` naming one of the eight companion controls abap2UI5 marks `// OBSOLETE:` — builder tag and raw XML alike, judged by the namespace and never by the prefix, so `sap.m.Title`/`core:Title` stay silent; emitted before the walk decides what to do with a foreign-namespace tag at all). The walk looks away from a foreign namespace with one exception: a companion control `lib/cc-controls.mjs` MIRRORS is judged like any UI5 control - its metadata layered over the snapshot by `withCompanionControls( )`, the real base class as its parent - so every rule above applies to it; a z2ui5.cc control nobody mirrored is still looked away from |
| `lib/chain-layout.mjs` | `chain-indentation`, `chain-element-per-line` — emitted through `checkAbapRules`, so every consumer that calls it gets them. Plus `chain-house-layout`, the first of the two **opt-in** rules (`OPT_IN` in `lib/findings.mjs`; the other is `portable-app`): `checkAbapRules` does not even run it unless the `rules` block asks, because its fixes span a whole chain and defer any other rule's fix inside it to a second pass (which `--fix` makes by itself since it runs to a fixed point, `MAX_FIX_PASSES` in `lib/fix.mjs`). The house-layout fix moves a segment's continuation lines with it, except a line that starts with a comment: a `*` is a comment in column 1 only, and a `"` comment's indent is the author's |
| `lib/abap-rules.mjs` | `non-released-api` (list: `lib/released-api.mjs`), `obsolete-binder`, `obsolete-model-update`, `obsolete-frontend-event`, `binding-to-local` (the ROOT of the bound name, like its two siblings below — `_bind( ls_local-field )` is lost with `ls_local`; a `->` dereference and a call carrying `tab =`, the framework's cell binding, are not judged), `binding-to-nonpublic`, `binding-to-static` (a `_bind( )` on a `CONSTANTS` or `CLASS-DATA`, in any section: the framework's `attri_search` filters on `is_class = abap_false AND is_constant = abap_false`, so the bind finds nothing and raises BINDING_ERROR — `binding-to-nonpublic` stands down for a static root, since PUBLIC would change nothing), `binding-to-reference`, `unconverted-abap-boolean`, `unescaped-text-in-attribute` (the text twin of the boolean rule: a value whose ORIGIN is data — a template that interpolates, a name whose assignments show no binding vocabulary — written through `v`, where a brace in it is a binding; the fix moves it onto the builder's `t`. Three things are NOT data: a `CONSTANTS`, an IMPORTING parameter every call site in the class passes a literal-only value — judged per method and parameter, since `text` is a parameter of more than one helper — and a value on a property whose type can show no text at all: `int`, `boolean`, a CSS size or colour, an id, a URI, an enum, resolved through the element literal nearest before the `a( )` call and the class's own `xmlns` declarations), `event-without-handler` (a handler is a `WHEN`, a `check_on_event( )`, or a comparison of `get_event( )` against a literal WHEREVER it stands — the one-branch `IF` abaplint's `short_case` forces, its `ELSEIF`/`OR` continuations, `EQ`, and the literal on the left), `event-arg-unresolved`, `event-arg-out-of-range`, `event-arg-js-callback`, `event-arg-single-row-table` (a `t_arg = VALUE #( ( x ) )` on a `client->_event( )` that carries ONE value, where `arg = x` is the same string_table - silent from two rows on, when both spellings are passed, and on a row containing a `#`, since `arg` is generic and `CONV #( )` has no type to derive there; fixable), `trailing-empty-event-arg`, `enum-field-unset-on-insert`, `unescaped-brace-in-style`, `collapsed-brace-in-style` (the sheet is bounded by `STYLE_OPEN` / `styleCloseAt( )` — the opening tag with its attributes and in any case, `<style type="text/css">` included, as css-classes.mjs reads it), `escaped-brace-in-backtick`, `unused-public-attribute`, `popover-display-val`, `popover-anchor-unknown-id`, `hardcoded-binding-path`, `live-event-roundtrip`, `get-viewname-removed`, `ui5-internal-access`, `commercial-ui5-host` (scoped to a RUNTIME load — a demo-kit link and a `/test-resources/` asset are not one, and reporting them is what made consumers switch it off wholesale), `source-line-too-long`, `obsolete-bind-argument`, `abap-date-formatter-mismatch`, `escape-sequence-in-backtick`, `private-app-attribute`, `popup-without-close-wire` (a `Dialog` built in a method that wires no event at all — per METHOD, a hint), `event-name-case-mismatch` (a raise spelled differently from its one handler — `get_event( )` compares letter for letter, and `event-without-handler` is case-blind on purpose, so this is the rule that sees `save` against `SAVE`; fixable), `handler-without-event` (the inverse of `event-without-handler` — a handler nothing raises, judged only when every raise and every handler is a literal, the class raises at least one event itself and never hands its client to another object; a hint), `binding-to-expression` (a `_bind( )` on a literal, a method call or a constructor expression — no attribute, no path, a runtime exception; an error), `loop-work-area-bound` (a `_bind( )` on the work area of a `LOOP AT` — one path for every row, or a path the model never carries; fixable in the ASSIGNING shape into the framework's cell binding `tab = … tab_index = sy-tabix`), `message-box-removed-parameter` (the pure UI5 options abap2UI5#2748 took off `message_box_display( )` / `message_toast_display( )` — `MESSAGE_BOX_REMOVED` / `MESSAGE_TOAST_REMOVED`; the class does not compile), `unknown-message-box-type` (a literal `type` outside `MESSAGE_BOX_TYPES`, the server's `ct_box_type`: the box falls back to a plain `show( )`; the message-type letters E/W/S/I have a fix), `close-only-roundtrip` (a `WHEN`/`ELSEIF check_on_event` branch whose only statement is `popup_destroy( )`/`popover_destroy( )` with no comment in it, for an event every raise of which is a plain `_event( … )` on a `press`; fixed to `follow_up_action( val = client->cs_event-popup_close )` on every raise and the branch deleted; `checkCloseOnlyBranches( )`), `bind-path-flag` (`_bind( val = x path = abap_true )` with no third argument, fixed to `_bind_path( x )`; a call inside a string-template embed counts, a bare `v =` value is left to the next one; `checkBindPathFlag( )`), `bind-path-as-value` (`_bind_path( x )` or `_bind( … path = abap_true )` as the WHOLE `v =` of an attribute: the attribute is the text `/X`; `checkBarePathValues( )`, fixed into the binding), `smart-variant-without-init` (a SmartVariantManagement in the id map and no `cs_event-smart_variant_init` or `cs_event-filter_bar_variant_init` wire anywhere in the class), `absent-boolean-overrides-default` (the boolean twin of `enum-field-unset-on-insert`, and it needs a SECOND signal: the seed has to be inconsistent), plus the activation family that follows the `source-line-too-long` precedent — `value-header-default-reassigned`, `into-corresponding-inline-decl`, `class-constructor-visibility`, `redundant-conv-i`, `redundant-serializable` (`INTERFACES if_serializable_object.` beside `INTERFACES z2ui5_if_app.`, which already includes it — read out of the INTERFACES STATEMENTS rather than with the usual guard, so the chained `INTERFACES: if_serializable_object, z2ui5_if_app.` is seen too; a hint, fixable where the line is its own statement AND the original spells it as the scrubbed copy does — a trailing comment is blanked there, and deleting it with the line is the guess fix.mjs forbids, so that line is reported without a fix), and the 2026-09 additions from the same staging area: `empty-catch-block` (SLIN's empty-handler finding, a hint), `boolc-instead-of-xsdbool` (the downport dialect), `delete-index-in-loop` (the loop-cursor runtime trap, an error), and the four the 2026-09-12 round promoted out of samples-controls's pattern-lint into the same `checkAbapHygiene( )` so `--all-classes` reaches them: `default-key-table` (a bare `TYPE [STANDARD] TABLE OF` with no `WITH … KEY`), `abapdoc-html-tag` (a raw `<tag>` in a `"!` line, read from the RAW source because the scrubbed copy has the comment blanked; the ABAP Doc markup tags exempt), `event-arg-default-index` (`get_event_arg( 1 )` / `( v = 1 )`, with a deleting fix), `client-handle-capture` (a `_bind( )`/`_event( )` handle assigned to a variable — judged on STATEMENTS, since a `v = client->_bind( )` continuation line starts a line too) — plus the frozen-builder half of `obsolete-custom-control` (`obsoleteCcHelpers( )`: `_z2ui5( )->timer( )` & co., or a handle assigned from `_z2ui5( )`, read as eight method NAMES — it runs from `checkSourceRules( )` and `checkAbapRules( )` alike, and `obsoleteCcHelperFindings( )` hands it to `check.mjs` for a class on `z2ui5_cl_xml_view`) — plus `unbound-public-attribute` beside `unused-public-attribute` (the same PUBLIC surface, the other half: used in ABAP, bound by nothing; kept a separate rule because the remedy is PROTECTED, not deletion; both stand down for a name another class reads as `->name` while naming this one - `outsideReads` in `classIndexOf( )`, which the CLI builds over every class under the configured `paths` (minus `ignore`) and not only the files the run checks (`indexOnlySources( )` in `cli.mjs`), so a one-file run judges against what the full run and the editor do, part of `classIndexDeps( )` so `--cache` re-judges the popup when its caller changes; a waiver of either rule in such a class is unjudged rather than `unused-directive` - `publicReadFromOutside( )` feeds settle's `stoodDown` - because the same class linted alone still needs it) — plus the abapGit round-trip family riding the `source-line-too-long` walk: `byte-order-mark`, `crlf-line-ending`, `trailing-whitespace`, `missing-final-newline` (all warnings — the file never stops diffing, but it imports; all four fixable) — plus `checkAbapRules( )` itself, the entry point every ABAP-side rule is called from and the order they run in |
| `lib/frontend-wires.mjs` | every `client->_event_client( )` / `follow_up_action( )` wire: `invalid-frontend-action` (the filter-row operator's case fix rides on the finding itself, so `checkAbapRules( )` alone carries it), `unknown-frontend-action`, `frontend-action-unknown-id`, `unknown-view-slot`, `literal-view-slot`, `invalid-keyboard-shortcut`, `invalid-action-payload`, `filter-groups-not-arrays`, `denied-control-method`, `settable-property-via-action`, `control-state-lost-on-rebuild`, `raw-javascript-to-frontend` (escape-hatch half), `frontend-action-too-new` (the four lazily-required globals carry a release floor; below it the require returns undefined and the wire is a no-op), `control-call-arg-count` and `control-call-arg-kind` (the arity and kinds `CONTROL_METHODS` declares — `castArgs` slices the excess away and `bool` is `X`/`true` and nothing else), `invalid-aggregation-item` (the `<id>/<aggregation>/<index>` form, of which only the head segment was ever judged), `navigation-lost-on-rebuild` (the navigation twin of `control-state-lost-on-rebuild`: `to`/`backToPage`/`toDetail`/`toMaster` off the display path while a bound field names a page of that container - judged after the loop like the setters, against the page ids `collectContainerPages( )` reads out of the views). Split out of `abap-rules.mjs` — one closed set after another, all mirrored in `lib/frontend-actions.mjs` and gated by `check-upstream.mjs` |
| `lib/portable.mjs` | `portable-app`, the second **opt-in** rule (`OPT_IN`): everything outside the abap2UI5 protocol's portable profile v1, judged against the verbatim copy in `data/portable-v1.json` (see the section on it below). ONE id, the part of the profile a finding misses in its `reason` (`PORTABLE_REASONS`: *control*, *custom control*, *member*, *binding*, *expression*, *event wire*, *event argument*, *frontend action*, *nested view*, *client API* - spelt with a hyphen in the data). Called from `checkAbapSource` (the documents and the class's client calls - the view-less app class gets the client-call half) and `checkXmlSource` only when `isOptInEnabled( rules, 'portable-app' )`, so a run that does not ask never reads the profile. Nothing is restated from the profile except the two root attributes (`ROOT_ATTRIBUTES`) and the server's `POPUP_CLOSE`/`POPOVER_CLOSE` -> `VIEW_SLOTS destroy` mapping. A leaf module (exported as `./portable`, no `fs`): the profile arrives as an object, `portableProfile` on the entry points for a host that cannot hand over a path |
| `lib/lifecycle-rules.mjs` | what the class does ACROSS a roundtrip: `view-never-displayed`, `missing-view-display-on-navigated`, `missing-on-navigated-branch`, `separate-lifecycle-ifs`, `manual-init-flag`, `duplicate-for-iterator` (case-folded — `FOR i` and `FOR I` are one iterator to the downport), `redundant-init-display` (the INVERSE of the two rules above it: `check_on_init( )` implies `check_on_navigated( )`, so an `OR` of the two and a fork whose arms are the same display call both decide nothing), `lifecycle-is-initial`, and the three FLOW rules over `branchTail( )` — `unconditional-popup-display` (a popup at the top level of `main( )`, rebuilt on every roundtrip), `display-after-nav-app-call` (a display behind the hand-over, usually a missing RETURN), `double-display-in-branch` (the same slot twice in one sequence, the first dead). Also split out of `abap-rules.mjs`, and called from exactly the points its code sat at: `report( )` collapses repeats and the FIRST finding of a shape wins, so the call ORDER is part of the output |
| `lib/guide-rules.mjs` | five sentences of the app guide (`docs/agents/building-apps.md` §5/§6) and of `z2ui5_if_client`'s ABAP Doc, read as rules through one entry point `checkGuideRules( )` called from `checkAbapRules( )`: `frontend-action-as-backend-event` (a `cs_event-` constant handed to `_event( )` in any spelling — a backend event named `POPUP_CLOSE` that closes nothing, and the one dead wire `event-without-handler` cannot judge because the name is not a literal; fixable, the rename to `follow_up_action( val = … )`), `popup-display-xml` (the mirror of `popover-display-val`; fixable), `queue-last-without-no-busy` (a `live*` wire — `isLiveEvent( )` in `abap-source.mjs`, the same prefix `live-event-roundtrip` applies — whose `s_ctrl` sets `check_queue_last` without `check_no_busy`, so the busy overlay flashes over the field being typed into; a hint, the fix writes the flag into the existing `VALUE #( )`), `nest-view-without-destroy` (`nest_view_display( )` / `nest2_view_display( )` with no `method_destroy`, every call adding one more fragment; fixable only for the three inserts the ABAP Doc names, `NEST_DESTROY_BY_INSERT`), `omit-initial-drops-false` (`_bind( val = t omit_initial = abap_true )` where the row declares an `abap_bool` the template binds to a property defaulting to `true` — read off the same `boolFields` map `absent-boolean-overrides-default` uses, which stands down under `omit_initial`; no fix). The file also owns `BOOLEAN_TYPES`, the one list of ABAP boolean types — `checkAbapBooleans( )` in abap-rules.mjs imports it, so `boole_d` and `xsdboolean` are booleans to `unconverted-abap-boolean`, `manual-init-flag`, `lifecycle-is-initial` and the text rule's `isBool` exactly as they are here. Every one probed silent on 0.7.0 and measured at 0 on abap2UI5's own app classes before shipping |
| `lib/abap-source.mjs` | no findings — the readers those three share (`literalElements`, `methodSpans`, `displayPathMethods`, `bindableAnywhere`, `ifBranchEnd`, `ifBlockEnd`, `branchTail` — the rest of a statement sequence on its own level, nested blocks blanked, which is what a "runs whenever this runs" question reads). Pure functions of a scrubbed source, so no module has to learn about another |
| `lib/icons.mjs` | `unknown-icon`, `icon-too-new`, `icon-removed` (data: `data/icons.json`) — a TEXT scan, not a view-tree walk, and called from both entry points (`checkAbapRules` for classes, `checkXmlSource` for raw XML): an icon name travels as data (a status column, a constant) at least as often as it travels as an attribute, and those never reach the node tree. Exported as `./icons` too, for the consumers that assemble the pipeline themselves instead of calling an entry point — see **A consumer that cannot hand us a path** below |
| `lib/reconstruct.mjs` | `excess-shut`, `duplicate-property`, `attribute-without-element`, `display-root-mismatch`, `chain-unbalanced-parens` (a chain with one `)` too many or one `(` never closed — a syntax error, and the one shape that makes `splitStatements` run the chain into the statement behind it, so the class used to reconstruct nothing and say nothing; read by a scan of its own, `noteUnbalancedParens`, that recovers at the stray paren, and ends an unclosed `(` at its statement's period the way `parenRegion( )` does - a `.` before a blank at any depth - so one unclosed call does not swallow the statements behind it), `open-levels` (note-only) — via `prep.structure`, consumed in `lib/check.mjs` |
| `lib/render.mjs` | render-gate failures (real `XMLView.create` errors); also the screenshot session behind `--screenshot` — same harness, view kept and photographed, theme LESS compiled on demand. A document's window closes only when the fetch/XHR requests it started have settled (`_settle( )` in the harness, bounded by `settleTimeout`); a page still waiting past the bound is reloaded before the next document, so a late answer is never charged to a document that did not ask for it |
| `lib/check.mjs` | `frozen-view-builder` — the finding a class on the retired `z2ui5_cl_xml_view` builder gets, emitted where the decision to judge it at all is made. Everything else about such a class is deliberately silent: the other rules are written for the current dialect, and running them over an API they do not model would trade a silent miss for confident noise. ONE exception, `obsolete-custom-control`: the old builder's `_z2ui5( )->timer( )` helpers are method NAMES on one receiver, not a view to model, and migrating such a chain would carry the Timer straight across |
| `lib/suggest.mjs` | no findings — `caseMatch( )`, the one did-you-mean the linter makes: the unique member of a closed set that is the written name up to letter case and `-`/`_`. Nine rules carry it as `written`/`suggestion` and a fix (`unknown-control`, `unknown-property`, `unknown-aggregation`, `invalid-property-value`, `unknown-event-parameter`, `unknown-icon`, `frontend-action-unknown-id`, `popover-anchor-unknown-id`, `unknown-directive-rule`); the view-side five get their span from `attachSuggestionFixes( )` in `findings.mjs`, the others compute it where they report. The CLI's `--explain` and the config loader's `unknown rule` error use it for a mistyped rule id against the same closed set. No edit distance, on purpose: `Buttom` → `Button` is a guess, `button` → `Button` is not |
| `lib/false-positive.mjs` | no findings — the issue a misfire is reported with. A baseline entry marked in the baseline's `falsePositives` block (key → why the code is correct; `loadFalsePositives( )` in `lib/baseline.mjs`, kept by `--update-baseline` while the entry lives) is a rule that got something wrong, recorded where nobody can fix the rule. `falsePositiveIssue( )` fills the sections of `.github/ISSUE_TEMPLATE/false-positive.md` from the finding and returns the prefilled link; `--report-false-positives` prints one per marked key and SENDS NOTHING — keep it that way, the excerpt is a consumer's source. The template's headings and this module's move together (`test/review/false-positives.mjs`) |
| `lib/project-index.mjs` | no findings — the objects the linted repository DEFINES, read off the abapGit file names (`objectNameOf`, `ownObjectsOf`; the `ownObjects` option). A rule that asks whose an object is asks here before it reads the name: `non-released-api` is silent on a `z2ui5_t_<n>` whose `.tabl.xml` is under the linted paths. `ignore` is not applied — an ignored tree is unchecked, not foreign |
| `lib/config.mjs` | no findings — the `abap2ui5lint.jsonc`/`.json` loader (discovery, validation, precedence, the `rules` block). New config keys go through its KNOWN set + a run.mjs assertion |
| `lib/findings.mjs` | the **severity/wording/position layer** (`severityOf`, `SEVERITIES`, `RULES`, messages) plus the two things a repo can say back to it: `applyRules` (the config's `rules` block) and `applyDirectives` (`abap2ui5lint-disable-*` comments) — and the two findings about the directives themselves, emitted from `applyDirectives` because that is the only place that knows what a directive did: `unknown-directive-rule` (an id not in `RULES`, a warning, with the `caseMatch( )` did-you-mean and a fix that rewrites the id; `render-error` gets its own sentence, since a directive can never address a render failure) and `unused-directive` (a directive that suppressed nothing — per id for a list, as a whole for a bare one; ESLint's `--report-unused-disable-directives`, a hint, with a deleting fix on the line forms). An id whose rule did not RUN on the source (off or excluded in `rules`, an unasked opt-in, a property-walk rule under `properties: false` — `WALK_ONLY_RULES` in `properties.mjs`, gated against the emit sites — and any rule a class that builds no view, or one on the frozen builder, is not judged by — `SOURCE_RULES` in `abap-rules.mjs`, gated the same way, plus `VIEWLESS_APP_RULE` for an app class, `notRunBut( )` in `check.mjs`) is unjudged, never `unused-directive`. Both go through `applyRules` and the directives like any other id, with one asymmetry: a BARE directive cannot waive its own finding, `" abap2ui5lint-disable unused-directive` may. Every consumer (CLI, VS Code extension, samples-controls `view-gates`, mcp-server) reads what a finding *means* from here; a new finding type needs its severity classified here or consumers fall back to a default |
| `lib/report.mjs` | no findings — the **output layer**: `summarize`, the `stylish`/`json`/`markdown` formatters, the GitHub workflow-command annotations, and the terminal rendering of `RULE_DOCS` behind `--explain` (`ruleIndex`, `formatExplain`, `formatRuleIndex`, `explainFooter`). The CLI only parses flags and picks one |

**A new rule is ONE file.** `lib/rules/<id>.mjs` exports a `defineRule( )`
object (`lib/rule.mjs`): id, severity, category, scope, the card (`summary`,
`detail`, `example`, `remedy`, `fixNote` when it fixes), `message( finding )`
and `check( context )`, plus one import line in `lib/rules/index.mjs`. Every
registry reads it from there — `SEVERITY_BY_TYPE` and `describe( )` in
`findings.mjs`, `RULE_DOCS`, `FIXABLE`, `OPT_IN`, `SOURCE_RULES`, the rule
page's "Defined in" link — so there is nothing to keep in step by hand, and a
definition that would fail a gate later (no card, a remedy equal to its
example) throws at import with the rule's id. The check reads the SHARED
model of the class, `context.model` (`lib/abap-model.mjs`: tokens with their
source offsets, statements with the keyword folded, class parts and
visibility sections, methods, attributes, locals) instead of scanning text
with regular expressions of its own: case, comments, literals, chained
declarations and statement ends are decided once, there, for every rule.
`runRules( )` gives each finding its `type` (a rule file never writes one)
and can time each rule (`timings`). A rule module imports leaf modules only
(`rule.mjs`, `abap-model.mjs`, `abap.mjs`, `suggest.mjs`) — the registries
import the rules, so anything else is a cycle; `test/review/rule-units.mjs`
gates that, the file-per-id layout and the registries. Step 4 below (a
fixture and assertions) is still yours to write.

One hundred and twenty-seven rules are written this way (`docs/agents/rule-map.md` lists
them): the hygiene, round-trip and guide families, three lifecycle rules,
fifty-seven rules of the property walk (scope `'node'`: `checkNodes( )` runs
each at its place, once per node, with the node, its control and metadata,
the control it sits in and the floor - an attribute rule also the
attribute, its value and its member; the readers they share with the walk
are `lib/ui5-meta.mjs` and `lib/binding-paths.mjs`), five rules of scope `'document'` (`malformed-xml`, `second-root`,
`unused-namespace-declaration`, `undefined-css-class`,
`external-link-without-target`: once per view document after the walk,
reading what the tree declares, uses and links from `documentFacts( )` in
`lib/view-document.mjs`), `non-released-api` (scope `'class'`, run for every
class by `checkAbapHygiene( )`), and twelve rules of scope `'app'` that
`checkAbapRules( )` runs at their own place with `runRule( )` - each was a
function of its own there and needed the context that place has (the
dialect, the view metadata, what the frontend-wire pass found). Their shared
readers moved to `lib/abap-helpers.mjs`, which reaches no registry. What is
left in the old shape is rules that share ONE function with others - the
attribute loop of the property walk (23 rules decided per attribute from one
member lookup), the walk's namespace and aggregation-tag branches, the frontend-wire pass, five rules of the
lifecycle dispatch (two blocks that decide several rules from one walk;
their shared facts are `dispatchFacts( )` already), the event-argument rules
and the inline blocks of `checkAbapRules( )`; moving one of those means
splitting a shared loop, rule by rule. Five read the model
(`boolc-instead-of-xsdbool`, `class-constructor-visibility`,
`empty-catch-block`, `into-corresponding-inline-decl`, `redundant-conv-i`);
the other six were LIFTED: their scan moved into the file as it was, over
`model.src` / `model.code`, so the rule is in one place first and reads the
model when somebody next works on it. Both moves changed no finding their
sections assert. `redundant-conv-i` is the one to read for
what the model buys: it asks `model.resolve( name, offset )` - the local of
the method, then its parameter, then the attribute, ABAP's own order - where
the old scan kept one class-wide set of names typed `i` and reported an
assignment to a local STRING that shared its name with an integer attribute. **The others are still in the old shape and move one at a
time**: delete the emit block, the `SEVERITY_BY_TYPE` line, the `describe( )`
case, the `RULE_DOCS` entry and the name in `FIXABLE`/`SOURCE_RULES`, write
the file, run the suite. An id defined both ways throws at import. Two things
the model does not do, so a rule that needs them stays where it is for now:
it follows no builder chain and resolves no value (that is the
reconstructor's, `lib/reconstruct.mjs`), and it records declarations, not
writes.

**A rule in the old shape moves four places together** — forgetting one has happened:

1. the emit site in `lib/`,
2. its severity in `SEVERITY_BY_TYPE` (`lib/findings.mjs`) — that is also what
   registers it as a rule id,
3. an entry in `RULE_DOCS` (`lib/rule-docs.mjs`) — category, summary, detail,
   and the `example`/`remedy` **pair**: the shortest source that triggers the
   rule, and the same source fixed. Both are gated; a remedy equal to its
   example fails too. Published as the `./rule-docs` export, so this prose is
   also what an agent reads through mcp-server's `validate_view` instead of
   being sent to a website — and what every report links at, `ruleUrl( )` for
   the card and `ruleExampleUrl( )` for the pair,
4. a fixture in `test/fixtures/` + assertions in `test/run.mjs`.

There used to be a fifth: a row in the README's finding-type table. The README
no longer documents the rules — it links the generated page — so `RULE_DOCS` is
now the only place the prose is written, and `npm test` gates it against the
registry. One place fewer to forget.

Step 4 is no longer on trust: the **rule-coverage gate** at the end of
`test/run.mjs` asserts that every id in `RULES` actually fired somewhere in the
suite, from what the checks produced (`test/observe.mjs` records it) rather
than from what the test source appears to mention. A rule registered in step 2
with no source that triggers it fails `npm test`. It is what found
`escaped-brace-in-backtick`, which had shipped with no test of any kind and
which nothing was in a position to notice.

Import the checks from `./observe.mjs` in tests, not from `../lib/index.mjs`
or `../lib/abap-rules.mjs` — a check called around the observer counts for
nothing.

`test/run.mjs` ends by loading every `test/review/*.mjs` — one file per topic
or per review round (`core.mjs`: reconstructor, CLI plumbing and the
case policy; `rules.mjs`: the ABAP-side rules and the lifecycle heuristics;
the generator and property-gate files beside them; `round-<date>.mjs`,
`audit-<date>.mjs` and `corpus-<date>.mjs` for a day's round, audit or
corpus sweep). Each file's default export
receives the harness `{ section, assert, f, FIX, tempDir, checkAbapSource,
checkXmlSource, checkFiles, prepareAbap }` — the observed checks, so the
sections count for the rule-coverage gate. A regression test for a rule fix
goes into the topic's file, not into the 6000-line `test/run.mjs`; a new topic
is a new file, nothing to register. `test/review/README.md` has the pattern.

A test about SPEED asks one question - does the work grow linearly - and
asks it through `test/timing.mjs` (`scalesLinearly( )`: n against 4n, best
of three, a 10x bound between linear's 4x and quadratic's 16x), never with a
bare wall-clock bound: the suite runs on loaded CI runners, and a fixed
number of milliseconds is a flake waiting for a slow one.
`test/review/timing-sweep.mjs` asks it of every rule at once: each card's
example (`playgroundSource( )`) grown in nine shapes - long line, line
block, nesting - on one worker per core, screened with one run each and
asked again with the best of three where the screen fails
(`screenedLinearly( )`). Two things it does not ask: nesting deeper than a
few hundred levels (a crash question, not a growth one - every walk over a
tree goes through `lib/tree.mjs`, `walkTree( )`/`nodesOf( )`, which do not
recurse; `round-2026-10-09c.mjs` judges a view nested 5,000 deep, and a new
walk written as a recursion is what that test catches), and a growth
whose quadratic part is still small at the sizes it can afford (many
documents, many unclosed calls): those have targeted tests in
`round-2026-10-09b.mjs`. A rule whose card changes shape changes what the
sweep exercises, so a new rule is swept without anything to register.

**Before writing a rule, ask whether the file is even collected.** A rule can
fail in two places and only one of them is visible: it can judge wrongly, or it
can never be handed the file. `collectFiles` keeps a class that calls a view
builder's factory and, since 2026-09-25, a class that declares
`INTERFACES z2ui5_if_app` without one (the app whose view a views class or a
generator builds — before that it was dropped even when named on the command
line, and `node cli.mjs zcl_app.clas.abap` answered `no checkable app classes`
with exit 0) — anything else is dropped, and a dropped file leaves the run
saying `no checkable app classes` with exit 0, which reads like approval. The
one exception is opt-in: `allClasses` (`--all-classes`) collects every
`.clas.abap`, and a class that builds no view is judged by `checkSourceRules( )`
alone — the abapGit round-trip family, the activation and hygiene rules of
`checkAbapHygiene( )`, the released-API check. An APP class that builds no view
gets those plus the ABAP-side rules that read the class and not the view
(`VIEWLESS_APP_RULE` in `lib/check.mjs`: the `binding-to-*`, `obsolete-*` and
`event-*` families, `private-app-attribute`, the lifecycle and flow rules), is
marked `appWithoutView` on its result, counted in the run summary, and named
under a one-file report — a clean verdict on it is a verdict on the class, not
on a view. A source-side rule that belongs
to helper classes too goes into one of those three; the view, wire and
lifecycle rules read an app class and stay out.

That is how `frozen-view-builder` was missed for a year: a complete app written
on `z2ui5_cl_xml_view` was not merely unjudged, it was invisible, and the
strongest false green this tool can produce is the one where it looked at
nothing. A findings test would never have caught it — the test for that rule
runs `collectFiles` over a real directory on purpose, because collection was
where it was broken.

So when a rule is about a shape this linter does not model, check what the CLI
prints for a file of that shape *before* deciding the rule is the whole fix.

Then regenerate and commit both artefacts — `npm test` fails while either is
stale:

```bash
npm run generate-schema      # data/abap2ui5lint.schema.json
npm run generate-rules-page  # site/index.html
```

`lib/frontend-actions.mjs`, `lib/formatters.mjs`, `lib/released-api.mjs` and
`lib/cc-controls.mjs` (whose `obsolete` blocks are `obsolete-custom-control`'s
list) are the **hand-maintained** knowledge files
(`lib/css-classes.mjs` is a sixth, of a different kind: the CSS-class PREFIX
families UI5's own stylesheets define, harvested once from the OpenUI5
sources — the file says how — and not watched by `check-upstream`, because
its source is UI5 and a family moves only when SAP starts a library)
(`lib/builders.mjs` is a fifth mirror of upstream, but of two class INTERFACES
rather than of a closed set — it changes only when a builder does), and all
four are watched by `scripts/check-upstream.mjs` (weekly via `upstream-sync.yml`, on drift an
issue): it re-derives the curated formatter exports and the `GLOBAL_TARGETS`
map from the abap2UI5 sources and fails on any difference — so an upstream
change becomes an issue here instead of a silent false positive at some
user's desk. On `lib/frontend-actions.mjs` in detail:
the closed whitelists `invalid-frontend-action` judges against. Its source of
truth is abap2UI5's frontend action modules (`app/webapp/core/actions/*.js`,
shipped as the `z2ui5_cl_ui5f_*_js` classes) — JavaScript embedded in an ABAP
string concatenation, which is not worth parsing, and that repo is not a
dependency here. Refresh it by reading `GLOBAL_TARGETS` and `BINDING_METHODS`
in `actions/ControlCall.js`. Kept in step 2026-08-02 with abap2UI5's new
`POPUP: setWithinArea` target (`sap.ui.core.Popup.setWithinArea`, @since
1.89) — a target added upstream is a **silent** breaking change here until
this file follows: the linter reports the correct new wire as an
`invalid-frontend-action`. Only **closed** sets belong in it, which is why
`CONTROL_BY_ID` is mirrored from its DENIED side (`CONTROL_METHOD_DENY_EXACT`,
`CONTROL_METHOD_DENY_PREFIXES` → `denied-control-method`) and not from an
allowed one: any public control method the denylist misses runs, so a
whitelist would report correct code while the denylist reports only wires the
frontend provably refuses. That mirror drifts in **both** directions —
a newly denied method is a wire the linter still calls fine, a freed one stays
reported as broken — so `check-upstream` compares both arrays.

A rule may also carry `fixes: [{ start, end, text }]` (see `lib/fix.mjs`):
exact spans in the source it was given, applied by `--fix`. Attach them only
when the correction is mechanical — a fix that has to guess is worse than a
finding that stays — and describe it in the rule's `fixNote`, which the test
requires for everything listed in `FIXABLE` — and list it there:
`test/review/round-2026-10-12-rules.mjs` runs every card and fails on a
finding type observed with a fix that `FIXABLE` does not name (four rules
rewrote unlisted until 2026-10-12). Write a fix's line breaks as
`\n`: the entry points rewrite them to the source's own line ending
(`matchLineEndings( )` in `lib/fix.mjs`), so a CRLF file stays CRLF.

`report( )` collapses findings of the same `type|control|member|value`. A
rule whose every occurrence is its own finding (two keyless tables in one
class) keeps them apart with `dedupe` (the offset, as a string), which the
collapse reads and then drops — **never with a position in `value` or
`member`**: both are part of the baseline key, and a position there makes a
baselined finding stale the moment a line is inserted above it. Ten rules did
that until 2026-10-08; `migrateKey( )` in `lib/baseline.mjs` still reads
their old keys.
