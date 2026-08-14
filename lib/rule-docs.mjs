/*
 * rule-docs — the prose behind every rule id.
 *
 * The reference the rules page (docs/index.html) and the README table are
 * generated from, so there is one place that says what a rule means. The
 * runtime does not import this: a finding's one-line message lives in
 * findings.mjs and has to stand on its own in a terminal. What is here is the
 * paragraph that does not fit there — why the defect matters, and what the
 * fix looks like.
 *
 * Every id in findings.mjs `RULES` needs an entry; npm test fails otherwise.
 *
 *   category  which group the rule appears under
 *   summary   one line, the README table cell
 *   detail    the paragraph on the rules page
 *   example   optional: the shortest source that triggers it
 */

export const CATEGORIES = [
  { id: 'metadata', title: 'Controls and members', blurb: 'Everything the view writes, resolved against the UI5 metadata snapshot generated from the OpenUI5 sources.' },
  { id: 'structure', title: 'View structure', blurb: 'Defects in the shape of the document itself — several of them make the view builder assert before a view is ever produced.' },
  { id: 'version', title: 'Version and deprecation', blurb: 'Portability against the UI5 version your system actually runs (--ui5, default 1.71) and the distribution it serves (--distribution).' },
  { id: 'abap2ui5', title: 'abap2UI5 semantics', blurb: 'The defects that stay silent at runtime, because they live in the relationship between the ABAP class and the view it builds. No UI5 tooling can see them.' },
  { id: 'data', title: 'Data and usability', blurb: 'The view loads and renders — but not with the data, or not for the user, the author had in mind.' },
];

export const RULE_DOCS = {
  /* ── controls and members ───────────────────────────────────────────── */
  'unknown-control': {
    category: 'metadata',
    summary: '`sap.m.Shell2` — no such control',
    detail: 'The control name is not in the metadata snapshot under any known library. Almost always a typo; UI5 fails to load the class and the view never appears. A control from a custom namespace is out of scope and never reported here.',
    example: 'view->leaf( `Buton` )',
  },
  'unknown-property': {
    category: 'metadata',
    summary: '`Button typ="…"` — no such property, event or association',
    detail: 'The attribute does not exist on the control or anywhere in its inheritance chain. UI5 in future mode rejects the view. A control whose chain leaves the snapshot is never reported as missing a member — the linter does not guess.',
    example: 'view->leaf( `Button` )->a( n = `typ` v = `Emphasized` )',
  },
  'unknown-aggregation': {
    category: 'metadata',
    summary: '`Page contentt` — no such aggregation',
    detail: 'An aggregation tag the parent control does not declare. UI5 then looks for a control class by that name and fails.',
  },
  'invalid-property-value': {
    category: 'metadata',
    summary: '`Button type="Emphasised"` — outside `sap.m.ButtonType`',
    detail: 'The literal is not a member of the enum the property is typed with, or it is not a number on an int/float property, or not a boolean on a boolean one. UI5 in future mode refuses the view rather than falling back to a default. Bindings and expressions are never value-checked — their value is a runtime matter.',
  },
  'invalid-aggregation-child': {
    category: 'metadata',
    summary: 'a control the aggregation\'s type does not accept',
    detail: 'The aggregation declares a type, and the control put inside it does not inherit from it. UI5 refuses to add the child, so the part of the view below it silently disappears.',
  },
  'too-many-children': {
    category: 'metadata',
    summary: 'two controls in a 0..1 aggregation',
    detail: 'A single-cardinality aggregation was filled more than once. Only one child survives — which one is not something to rely on.',
  },
  'missing-required-aggregation': {
    category: 'data',
    summary: 'a `Table` bound to rows but given no `columns` — renders empty',
    detail: 'The control has data but not the aggregation it needs to show any of it. Nothing fails: the table renders, and it renders empty, which is the hardest kind of bug to see in a screenshot.',
  },

  /* ── view structure ─────────────────────────────────────────────────── */
  'excess-shut': {
    category: 'structure',
    summary: 'one `shut( )` more than the builder tree is deep',
    detail: 'The builder ascends past the root — one `shut( )` / `end( )` too many. Both builders assert on it (`parent IS BOUND`), so the app dumps before it renders.',
  },
  'duplicate-property': {
    category: 'structure',
    summary: 'the same attribute written twice on one control',
    detail: 'The view builder asserts on a repeated attribute rather than letting the second value win silently.',
  },
  'attribute-without-element': {
    category: 'structure',
    summary: '`a( )` / `att( )` on the bare factory root — nothing to attach it to',
    detail: 'An attribute call before any element was opened. There is no element to carry it, and the builder asserts.',
  },
  'duplicate-aggregation': {
    category: 'structure',
    summary: 'the same aggregation opened twice under one control',
    detail: 'The second tag replaces the first, so everything built into the first one is gone from the rendered view — without a word from anywhere.',
  },
  'aggregation-in-aggregation': {
    category: 'structure',
    summary: 'an aggregation directly inside another one',
    detail: 'Invalid XML, and the signature of a missing `shut( )`: UI5 goes looking for a control class by that aggregation name and fails.',
  },
  'display-root-mismatch': {
    category: 'structure',
    summary: 'a `mvc:View` handed to `popup_display( )`, or a `core:FragmentDefinition` to `view_display( )`',
    detail: 'The slot decides how the client builds the document: `view_display( )` and the nested variants go through `XMLView.create`, `popup_display( )` and `popover_display( )` through `Fragment.load`. A fragment is not a view, and a view has no `open( )` — so the wrong pairing fails in the browser. Only reported where the document root and the consuming call are in the same statement; a bare control root is a legitimate fragment and is never reported.',
    example: 'client->popup_display( popup->stringify( ) ).  " popup built with n = `View`',
  },
  'duplicate-id': {
    category: 'structure',
    summary: 'the same `id` twice',
    detail: 'A duplicate-ID error at runtime — UI5 IDs are unique per view.',
  },
  'undeclared-namespace': {
    category: 'structure',
    summary: '`ns = \'form\'` without an `xmlns:form`',
    detail: 'The prefix is used but never declared on the view root, so the parser cannot resolve the control at all.',
    fixNote: 'For the conventional prefixes (`core`, `mvc`, `l`/`layout`, `form`, `f`, `table`, `u`/`unified`, `uxap`, `tnt`, `html`, `cc`) the missing declaration is inserted next to the root\'s first `xmlns` write; an unconventional prefix could mean any library and is left alone.',
  },
  'invalid-expression-binding': {
    category: 'structure',
    summary: 'unbalanced braces or parens in `{= … }`',
    detail: 'The expression binding cannot be parsed. UI5 reports a parse error and the attribute stays unbound.',
  },

  /* ── version and deprecation ────────────────────────────────────────── */
  'control-too-new': {
    category: 'version',
    summary: 'control introduced after your target UI5 version',
    detail: 'The control does not exist on the system you are targeting (`--ui5`, default 1.71), so the view will not load there — however well it works on a newer one. Waive a deliberate case with `--allow sap.m.Control`.',
  },
  'member-too-new': {
    category: 'version',
    summary: 'property, event or aggregation introduced after your target version',
    detail: 'Same as `control-too-new`, one level down. Members without an `@since` count as always available — they predate version tracking. Waive with `--allow sap.m.Control.member`.',
  },
  'event-parameter-too-new': {
    category: 'version',
    summary: 'a `${$parameters>/name}` the event only gained later',
    detail: 'An event parameter read back in a `t_arg` that the event did not carry yet at your floor. Resolved per event, not per parameter name, so an identically named parameter on another event does not mask it.',
  },
  'unknown-event-parameter': {
    category: 'metadata',
    summary: 'a `${$parameters>/typo}` the event does not declare',
    detail: 'The parameter name is resolved against the event\'s own metadata — a name it does not declare usually arrives **empty** at `get_event_arg( )`, with no error anywhere. Judged only against an event the control declares **itself**, with a parameters block: a subclass can widen an inherited event without redeclaring it (`sap.m.DateRangeSelection` fires `change` with `from`/`to`/`valid` while the declared parameters sit on `InputBase`). A hint, not a warning, because even that is not proof — a control can fire more than its metadata declares (`ColorPickerPopover` forwards the picker\'s `change` parameters verbatim, `colorString` included, and declares none of that). The finding lists the parameters the event does declare.',
    example: 'a( n = `search` v = client->_event( val = `GO`\n   t_arg = VALUE #( ( `${$parameters>/quer}` ) ) ) )  " query, not quer',
  },
  'enum-value-too-new': {
    category: 'version',
    summary: 'an enum VALUE introduced after your target version',
    detail: 'The property predates version tracking, the type is old — but the specific value is not: `sap.m.ButtonType.Critical` is @since 1.73 on a property that existed forever. The member-level `@since` sits on the property, never on the value, so this was invisible to every gate (and a documented manual-check burden downstream). The snapshot now keeps the per-value `@since` from the enum\'s JSDoc; a value without one predates version tracking and stays silent. Waive a deliberate case with `--allow sap.m.Control.member`, like the other floor rules.',
    example: 'view->leaf( `Button` )->a( n = `type` v = `Critical` )  " @since 1.73 on a 1.71 target',
  },
  'control-deprecated': {
    category: 'version',
    summary: 'control already deprecated at your target version',
    detail: 'Reported only once the deprecation is in effect at the version you target — a control deprecated as of 1.149 stays silent for a 1.71 target.',
  },
  'member-deprecated': {
    category: 'version',
    summary: 'property or event already deprecated at your target version',
    detail: 'As `control-deprecated`, per member. The replacement is usually named in the deprecation text the finding quotes.',
  },
  'sapui5-only-control': {
    category: 'version',
    summary: 'needs SAPUI5, absent from OpenUI5',
    detail: 'Only with `--distribution openui5`. SAPUI5 ships libraries OpenUI5 does not — `sap.ui.comp` (Smart controls), `sap.suite.*`, `sap.ushell`, `sap.fe`, `sap.viz` — so a SmartTable is fine on SAPUI5 and a guaranteed runtime error on OpenUI5.',
  },

  /* ── abap2UI5 semantics ─────────────────────────────────────────────── */
  'unknown-binding-path': {
    category: 'abap2ui5',
    summary: 'a hand-written `{/TYPO}` the derived model has no path for',
    detail: 'The field just stays empty — no error, anywhere. Inside a bound aggregation a relative `{TYPO}` is resolved against the row, so a misspelled column field is caught too, but only where the row shape is known from the class\'s `TYPES`. Never guessed.',
  },
  'binding-for-event': {
    category: 'abap2ui5',
    summary: '`_bind( )` on an event — a dead control',
    detail: 'The slot is an event, so a data binding in it never becomes a handler. The control renders and does nothing. Use `client->_event( )`.',
  },
  'event-for-property': {
    category: 'abap2ui5',
    summary: '`_event( )` on a property',
    detail: 'The mirror image: an event handler written into a data slot. Use `client->_bind( )`.',
  },
  'non-released-api': {
    category: 'abap2ui5',
    summary: 'an abap2UI5 object outside the released `src/02` package',
    detail: 'abap2UI5 releases exactly one package — `src/02`, five objects: `z2ui5_if_app`, `z2ui5_if_client`, `z2ui5_if_exit`, `z2ui5_cl_ui5_http_handler`, `z2ui5_cl_ui5_view_builder`. Everything else the repository ships says in its own package description that it is not for consumers: `src/01` is "abap2UI5 — internal use only", `src/99` is frozen legacy that "ships solely so existing downstream installations keep compiling", and `src/00` holds renamed copies of AJSON, S-RTTI and abap-util. None of them carries a compatibility promise or announces a change: one upstream commit renamed the entire core layer (`z2ui5_cl_core_*` → `z2ui5_cl_ui5_*`) and moved the old view builder and HTTP handler into the frozen package on the same day. An app that names one of those compiles today and fails to activate after the next `abapGit` pull, with no deprecation in between — and nothing in a systemless pipeline says so beforehand. Judged only against names the linter knows are framework objects (the frozen package by name, the internal packages by the prefixes upstream reserves), so your own `z2ui5_`-prefixed classes are never reported. One frozen object is deliberately tolerated: `z2ui5_if_types`, because the released `z2ui5_if_client~get( )` still returns `z2ui5_if_types=>ty_s_get`, so an app that declares a variable of that type cannot avoid the name. The frozen view builder `z2ui5_cl_ai_xml` IS reported — the linter reads its successor `z2ui5_cl_ui5_view_builder` just as well, so the advice the finding gives costs no coverage.',
    example: 'DATA(json) = z2ui5_cl_ajson=>create_empty( ).      " vendored copy, renamed on the next sync\nz2ui5_cl_pop_to_confirm=>factory( ).                " frozen — use the popups addon\nDATA(html) = z2ui5_cl_util=>xml_stringify( data ).  " retired utility class',
  },
  'chain-indentation': {
    category: 'abap2ui5',
    summary: 'a builder call whose indentation contradicts the tree it builds',
    detail: 'A builder chain is the one part of an abap2UI5 class that nothing else formats: abaplint has `indentation` and `in_statement_indentation` switched off (a chain is a single statement spanning fifty lines), so neither `abaplint --fix` nor the auto-format workflow ever touches its inner lines. And the reader has no other picture of the view — the XML the builder emits is one long line by construction, so **the ABAP indentation IS the view\'s structure**. When it drifts, the tree in the file stops matching the tree in the browser. What is judged is only that: a sibling written at a different column than the siblings it shares a parent with, or a call written to the LEFT of the element it belongs to. The SIZE of the indent step is not judged — two and four are both house styles in the wild, and the first child under a node defines the column its siblings are held to, so a chain that keeps its own rhythm is never reported. Neither is the column of `shut( )`/`end( )` (the hanging close is established), nor `v =` alignment, nor line length, nor a chain written entirely on one line. A hint: the view renders identically either way.',
    example: ')->open( `Page`\n    )->leaf( `Input`\n  )->leaf( `Button`   " a sibling of Input, written a level out',
  },
  'chain-element-per-line': {
    category: 'abap2ui5',
    summary: 'several controls on one line of a multi-line chain',
    detail: 'One element per line is what makes the indentation able to show the tree at all — a line holding three controls hides three levels of it. Only ELEMENTS count: an attribute on the same line as the control it belongs to hides nothing, so `)->leaf( `Text` )->a( n = `text` v = `{TITLE}` )` is the compact one-control form half the samples (and abap2UI5\'s own startup app) are written in and is never reported. Closing calls do not count either, because `)->shut( )->shut( ).` as a chain\'s last line is an established ending. Reported only for a chain already written across several lines, so the one-liner stays available. A hint, like its neighbour.',
    example: ')->leaf( `Input` )->leaf( `Button` )->leaf( `Text` )   " three controls, one line',
  },
  'obsolete-binder': {
    category: 'abap2ui5',
    summary: '`client->_bind_edit( )` — superseded by `client->_bind( )`',
    detail: '`_bind` is two-way as well, and `_bind_edit` is a pure alias for it. A call passing `custom_mapper_back` or `custom_filter_back` used to be exempt, because `_bind` has no such parameters — that exemption is gone with the parameters\' meaning: they are still accepted for source compatibility but no longer evaluated, per-direction mapping does not exist any more. Such a call is reported like every other, but without the autofix: the arguments have to go with the rename, and dropping an argument is not a rename.',
    example: 'a( n = `value` v = client->_bind_edit( name ) )   " → client->_bind( name )',
    fixNote: 'Rewritten to `client->_bind( )`, the arguments untouched — except where the call passes `custom_mapper_back`/`custom_filter_back`, which is reported without a fix.',
  },
  'obsolete-model-update': {
    category: 'abap2ui5',
    summary: '`view_model_update( )` & friends — empty methods, the model is pushed automatically',
    detail: 'The framework compares the model state before `main( )` with the state after it returned and, when they differ, sends it to every open view slot by itself. `view_model_update( )`, `nest_view_model_update( )`, `nest2_view_model_update( )`, `popup_model_update( )` and `popover_model_update( )` are therefore deliberately **empty** methods, kept in `z2ui5_if_client` only so existing apps keep compiling. A leftover call is not merely dead weight — it reads as "the model is pushed here" at a place where nothing at all happens. Delete it. The one thing that went with them is the ability to force an *unchanged* model back onto the client (a control that wrote a bound property without sending it back): rebuild the view with `view_display( )` for that.',
    example: 'client->popup_model_update( ).   " does nothing — delete it',
    fixNote: 'The call is deleted, together with the line when it has that line to itself; a line shared with other code or a trailing comment keeps everything but the call.',
  },
  'obsolete-frontend-event': {
    category: 'abap2ui5',
    summary: '`client->_event_client( )` — superseded by `client->follow_up_action( )`',
    detail: 'The same call, with the same `val` / `view` / `t_arg`. Since `follow_up_action( )` gained a `RETURNING` parameter it is the same call in the same *position* too: where its result is consumed — the view-attribute form `v = client->_event_client( … )` — it takes the `IF result IS SUPPLIED` branch straight to `mo_srv_event->get_event_client( )`, which is `_event_client( )`\'s entire body. One method now both schedules a frontend action and wires one, so the second name is a leftover. The one non-equivalence is `follow_up_action( )`\'s `CASE`, which intercepts `cs_event-set_nav_routing` / `set_push_state` / `set_app_state_active` before that branch: those three are backend-side navigation options, not frontend handlers, so a view attribute wired to one of them never dispatched anyway.',
    example: 'a( n = `press` v = client->_event_client( val = client->cs_event-popup_close ) )\na( n = `press` v = client->follow_up_action( val = client->cs_event-popup_close ) )',
    fixNote: 'Rewritten to `client->follow_up_action( )`, the arguments untouched.',
  },
  'unconverted-abap-boolean': {
    category: 'abap2ui5',
    summary: 'an ABAP boolean written straight into the view',
    detail: 'It arrives as `\'X\'` or `\' \'`, and UI5 reads any non-empty string as true — so `visible = abap_false` makes the control **visible**. The classic silent inversion. Each builder has its own way out, and the finding names the one that belongs to the call it found: `z2ui5_cl_ai_xml` wraps the flag in `as_bool( )`, `z2ui5_cl_ui5_view_builder` takes it through `att( b = … )`, which renders `true`/`false` itself.',
    fixNote: 'A bare token is converted in the dialect of the call — `att( v = flag )` becomes `att( b = flag )`, `a( v = flag )` becomes `a( v = z2ui5_cl_ai_xml=>as_bool( flag ) )`; an expression is left alone.',
  },
  'binding-to-local': {
    category: 'abap2ui5',
    summary: 'a local variable bound',
    detail: 'The instance is serialized across the roundtrip, the method stack is not — so the value is gone when the answer comes back. Bind an instance attribute.',
  },
  'binding-to-nonpublic': {
    category: 'abap2ui5',
    summary: 'a PROTECTED/PRIVATE attribute bound',
    detail: 'Only PUBLIC attributes are serialized into the model (`z2ui5_cl_ui5_srv_model` filters on visibility), so binding one from another section fails the **first roundtrip** with `BINDING_ERROR — No class attribute for binding found`. Move the attribute to the `PUBLIC SECTION`. Judged by the root of the bound name (a structure component travels with its root), and only when the class declares a `PUBLIC SECTION` to compare against. Found live: an ai-demokit port bound `expanded` from its PROTECTED section and had never worked in a running system — its `LIVE_TEST` deviation was telling the truth the whole time.',
    example: 'PROTECTED SECTION.\n  DATA expanded TYPE abap_bool.   " BINDING_ERROR on the first roundtrip\n" … )->a( n = `expanded` v = client->_bind( expanded ) )',
  },
  'ui5-internal-access': {
    category: 'abap2ui5',
    summary: '`mProperties` & friends — private UI5 internals',
    detail: 'The `mProperties`/`mAggregations`/`mBindingInfos`/`mEventRegistry` member tables are UI5 implementation details with no API contract — they are renamed or restructured across UI5 patches without notice, so a wire or expression that reads them works on the version it was written against and breaks silently on the next one. Restructure to a two-way binding or a public parameter.',
  },
  'commercial-ui5-host': {
    category: 'version',
    summary: 'a URL pinned to the commercial SAPUI5 host',
    detail: 'The same portability family as `sapui5-only-control`: `sdk.openui5.org` serves the open distribution, `ui5.sap.com` / `*.hana.ondemand.com` serve SAPUI5. An app whose assets or bootstrap point at the commercial host breaks the moment it runs against an OpenUI5-only landscape.',
  },
  'view-never-displayed': {
    category: 'abap2ui5',
    summary: 'a view is built but never handed to the client',
    detail: 'An empty page and no error: the builder ran, the result was never passed to `client->view_display( )` (or a nested-view, popup, popover or nav call).',
  },
  'event-arg-out-of-range': {
    category: 'abap2ui5',
    summary: '`get_event_arg( n )` past the `t_arg` the event declares',
    detail: 'The arguments are static — they are written at the raise site — so reading past them is never anything but a mistake: initial in ABAP, a 500 in the transpiled runtime, and either way not the value the handler works with. Judged only for a literal index, inside the handler of an event the class raises itself with `client->_event( )`, and never across a method boundary: an event arriving from a `message_box_display( onclose = )` callback or a frontend action carries arguments from a source this pass cannot see.',
    example: 'client->_event( val = `PICK` t_arg = VALUE #( ( `${$source>/id}` ) ) )\n" … WHEN `PICK`. client->get_event_arg( 2 )',
  },
  'invalid-frontend-action': {
    category: 'abap2ui5',
    summary: 'a frontend-action `t_arg` outside the set the runtime accepts',
    detail: 'A `client->_event_client( )` / `client->follow_up_action( )` wire is dispatched in the browser by name, and a name outside the whitelist raises nothing anywhere: FrontendAction logs to the console and the control does nothing when pressed. Judged only for literal arguments and only where the runtime\'s set is closed — the `CONTROL_GLOBAL` object and its method, the `BINDING_CALL` method, and `CONTROL_BY_ID`\'s obsolete empty view slot (which shifts the method out of position). `CONTROL_BY_ID`\'s method list is open by design and is never judged.',
    example: 'client->_event_client( val   = client->cs_event-control_global\n                       t_arg = VALUE #( ( `MESSAGE_TOASTER` ) ( `show` ) ( `hi` ) ) )',
  },
  'collapsed-brace-in-style': {
    category: 'abap2ui5',
    summary: 'an escaped CSS brace written inside a `|…|` template',
    detail: 'An escape only reaches the serialized attribute when the backslash is taken verbatim, which is what a backtick literal does. Inside an ABAP string template the backslash is the template\'s own escape: `\\{` collapses to a bare `{` before the builder ever sees it, and the view dies exactly as if nothing had been escaped. Write the stylesheet in a backtick literal — or, if it has to be a template, double the backslash (`\\\\\\{`). Invisible to `unescaped-brace-in-style`, which reads the source and sees a backslash in front of every brace; only the literal\'s kind tells the two apart.',
    example: 'DATA(css) = |<style>.a \\{color:red\\}</style>|.  " collapses\nDATA(ok)  = `<style>.a \\{color:red\\}</style>`.  " survives',
  },
  'unused-public-attribute': {
    category: 'abap2ui5',
    summary: 'a PUBLIC attribute nothing in the class ever touches',
    detail: 'Only PUBLIC attributes are serialized into the model (`z2ui5_cl_ui5_srv_model` filters on visibility), so every one of them is shipped to the browser on every roundtrip. One that is never bound, never read and never written is pure transport weight. Deliberately narrower than "not bound in any view": an attribute used only in ABAP code is not dead, it is *state* — PUBLIC is precisely how a value survives the roundtrip. Only a name that appears exactly once in the whole class, its own declaration, is reported, and only as a hint: an attribute can still be read from outside the class, which no single source file can see.',
  },
  'unescaped-brace-in-style': {
    category: 'abap2ui5',
    summary: 'literal CSS braces in a `<style>` block',
    detail: 'UI5\'s XMLView parser reads an unescaped `{` in an attribute value as the start of a binding, so a stylesheet injected through a `core:HTML` content attribute takes the whole view down with a binding parse error. Write every brace as `\\{` and `\\}`. Judged between `<style>` and `</style>`, so a `{0}` toast template or a `${$parameters>/…}` wire elsewhere in the same builder chain is never mistaken for CSS.',
    example: 'DATA(css) = `<style>.box \\{color:red\\}</style>`.',
  },
  'escaped-brace-in-backtick': {
    category: 'abap2ui5',
    summary: 'a binding written with escaped braces inside a `backtick` literal',
    detail: "Brace escaping is a |…| TEMPLATE rule. In a template the backslash is ABAP's own escape, so `\\{` reaches the builder as a bare `{` — which is exactly what a binding needs. A `backtick` literal has no escape processing at all: the backslash is taken verbatim and lands in the serialized attribute, where UI5 reads `\\{ path: … \\}` as text rather than a binding and either renders it raw or fails to parse the view. Write plain braces in a backtick literal; keep the escapes for the template form.",
    example: "a( n = `items` v = `\\{ path: 'message>/' \\}` )   \" the backslash reaches the XML\na( n = `items` v = `{ path: 'message>/' }` )     \" correct in a backtick literal\na( n = `items` v = |\\{ path: '{ p }' \\}| )       \" correct in a template",
  },
  'popover-display-val': {
    category: 'abap2ui5',
    summary: '`popover_display( val = … )` — the parameter is `xml`',
    detail: 'The one asymmetry in the display family: `popup_display( )` imports `val`, `popover_display( )` imports `xml`. A `val =` guessed by analogy does not compile — but nothing in a systemless pipeline says so before activation, so the mistake rides along until the class first meets a compiler. One of the most common first-try mistakes in generated code.',
    example: 'client->popover_display( val = popover->stringify( ) ).  " does not compile\nclient->popover_display( xml = popover->stringify( ) ).  " correct',
    fixNote: 'The parameter name is rewritten to `xml`, the argument untouched.',
  },
  'hardcoded-binding-path': {
    category: 'abap2ui5',
    summary: "an absolute binding path written as text — `{/PATH}` or `path: '/PATH'`",
    detail: "The runtime only registers what `client->_bind( )` was given, so a textual path either addresses nothing (that half is `unknown-binding-path`) or duplicates a bind that exists elsewhere — and then silently breaks the moment the attribute is renamed, because no compiler follows a string. Derive the path instead: `client->_bind( var )` for the `{binding}`, or the bare-path form `client->_bind( val = var path = abap_true )` interpolated into a binding-info template. An OData entity path with a key predicate (`{/Products('4711')}`) in a class that switches its default model to an OData service is exempt — that path addresses the service, not an ABAP variable.",
    example: "a( n = `title` v = `{/TITLE}` )                        \" breaks on rename\na( n = `title` v = client->_bind( title ) )            \" moves with the variable",
  },
  'missing-view-display-on-navigated': {
    category: 'abap2ui5',
    summary: 'a `check_on_navigated( )` branch that never re-displays the view',
    detail: "When a called app leaves, the browser still shows THAT app's view — returning control alone changes nothing on screen. The `check_on_navigated( )` branch has to hand a view back with `client->view_display( )`. A branch that only reads the result and falls through leaves the screen showing the wrong app, with no error anywhere. `view_model_update( )` used to count as a re-display here and no longer does: it is an empty method now (`obsolete-model-update`), and the automatic model push that replaced it reaches the MAIN slot — which is still holding the called app's view.",
    example: 'ELSEIF client->check_on_navigated( ).\n  result = client->get_app( client->get( )-s_draft-id ).\n  client->view_display( render_view( ) ).  " without this: the sub-app stays on screen',
  },
  'separate-lifecycle-ifs': {
    category: 'abap2ui5',
    summary: 'lifecycle checks in separate `IF` blocks instead of one `IF`/`ELSEIF` chain',
    detail: 'The lifecycle flags (`check_on_init`, `check_on_event`, `check_on_navigated`, …) are not all mutually exclusive, so separate `IF` blocks can execute more than one branch on a single roundtrip — the classic symptom is work done twice after a navigation. One `IF`/`ELSEIF` chain makes the branches exclusive by construction. The guard idiom is exclusive too and is never reported: an `IF` block that leaves the method (`IF client->check_on_event( \\`GO\\` ). … RETURN. ENDIF.`) cannot flow into the next block.',
    example: 'IF client->check_on_init( ).\n  " …\nELSEIF client->check_on_navigated( ).  " ELSEIF, not a second IF\n  " …\nENDIF.',
  },
  'duplicate-for-iterator': {
    category: 'abap2ui5',
    summary: 'the same `FOR` iterator name twice in one method',
    detail: 'Fine on ABAP 7.50+, where the iterator is local to its `VALUE #( )` expression — but a 7.02 downport (abaplint `--fix`, and the transpiler behind a Node-based runtime) materializes each one as `DATA <name> TYPE i` in the method body, and the second declaration fails activation with "variable already defined". Use distinct names (`i`, `j`, `k`) per `VALUE` block.',
  },
  'binding-to-reference': {
    category: 'abap2ui5',
    summary: 'a `TYPE REF TO` attribute bound without dereferencing',
    detail: 'The model serializer walks DATA, not references — `client->_bind( )` on an attribute declared `TYPE REF TO …` throws at runtime. Bind the dereferenced data (`client->_bind( ref->* )`) or a plain data attribute. Both sample fixes that established this pattern were found by users hitting the exception in a running system.',
    example: 'DATA mt_data TYPE REF TO data.\n" …\n)->a( n = `items` v = client->_bind( mt_data )      " throws\n)->a( n = `items` v = client->_bind( mt_data->* )   " binds the table',
  },
  'manual-init-flag': {
    category: 'abap2ui5',
    summary: 'a hand-rolled init flag instead of `client->check_on_init( )`',
    detail: 'The framework already knows whether this is the first run of the app instance — `client->check_on_init( )` is the lifecycle contract. A boolean attribute that gates the first render duplicates that knowledge as serialized state: it ships to the browser on every roundtrip for nothing, and subtle ordering bugs grow around the moment it flips. One mass migration replaced this pattern in 111 sample classes at once. Only the unambiguous shape is reported: an `IF` on the attribute being initial/false whose branch both sets it true and hands a view over — a lazy-load guard that displays nothing is left alone.',
    example: 'IF check_initialized = abap_false.   " reported\n  check_initialized = abap_true.\n  client->view_display( render( ) ).\nENDIF.\n" instead:\nIF client->check_on_init( ).\n  client->view_display( render( ) ).\nENDIF.',
  },
  'event-on-disabled-control': {
    category: 'abap2ui5',
    summary: 'an event handler on a control hard-disabled with a literal',
    detail: 'A bound `enabled` can flip at runtime, but a literal `enabled="false"` never does — the control can never fire, so the handler wired next to it is dead code that reads like a live wire. A hint, because a 1:1 port of a sample demonstrating the disabled *state* legitimately carries the original\'s handler. Bind `enabled` if it should ever flip.',
    example: ')->leaf( `Button`\n    )->a( n = `press`   v = client->_event( `SAVE` )\n    )->a( n = `enabled` v = `false`   " SAVE can never fire',
  },
  'live-event-roundtrip': {
    category: 'abap2ui5',
    summary: 'a `liveChange` wire that round-trips per keystroke',
    detail: 'abap2UI5 serializes round-trips: an event fired while one is in flight is **dropped**, not queued. A `liveChange` wired to `client->_event( )` therefore sees the value of the last *completed* trip and skips the ones typed in between — the bound field lags under fast input and converges only when typing pauses. Prefer a two-way binding (the model updates without any event) or the control\'s final-value event (`change`/`search`/`submit`); keep the live wire only when every intermediate value genuinely must reach ABAP. `_event_client` and `follow_up_action` are frontend-only and are not judged.',
    example: ')->a( n = `liveChange` v = client->_event( `SEARCH` )   " lossy under fast typing\n" instead: bind two-way and react to the final-value event\n)->a( n = `value`  v = client->_bind( search_term )\n)->a( n = `change` v = client->_event( `SEARCH` )',
  },
  'event-without-handler': {
    category: 'abap2ui5',
    summary: 'an event nothing reacts to',
    detail: 'Usually a dead control — but in abap2UI5 an event also forces a roundtrip, and that alone synchronises the model back into ABAP. So this is a hint, never an error, and it is skipped entirely when handler names are not literals.',
  },
  'trailing-empty-event-arg': {
    category: 'abap2ui5',
    summary: 'the last `t_arg` entry is empty and never arrives',
    detail: '`get_t_arg` buffers an empty argument and flushes it only when a later non-empty one follows, so an empty entry between filled ones keeps its slot and a TRAILING one disappears. The handler\'s `get_event_arg( n )` for that position reads initial, with no error anywhere. The framework pads a missing trailing argument only for a nullable declared kind on a control method, which does not apply to a backend `_event`.',
  },
  'json-literal-in-attribute': {
    category: 'abap2ui5',
    summary: 'a raw JSON literal written into a view attribute',
    detail: 'UI5 parses an attribute value starting with `{` as a binding, so a JSON object literal (`{"sap.card":…`) is read as a binding path and the attribute ends up empty — the classic way to lose an integration Card\'s manifest. Keep the JSON in the model and bind it: `client->_bind( manifest )`.',
  },
  'event-arg-unresolved': {
    category: 'abap2ui5',
    summary: 'a bare-brace `t_arg` literal (`` `{COL}` ``)',
    detail: 'The runtime sends it verbatim, but only `$`-prefixed expressions are resolved by UI5 — so `get_event_arg( )` receives an **empty** value, with no error anywhere. Write `` `${COL}` ``. A template that starts with a `{0}` placeholder is fine: that form is quoted.',
    fixNote: 'The missing `$` is inserted in the literal form; a `|…|` template is left alone.',
  },

  /* ── data and usability ─────────────────────────────────────────────── */
  'frontend-action-unknown-id': {
    category: 'abap2ui5',
    summary: 'an id-addressed wire naming an id no view declares',
    detail: 'The frontend resolves the first `t_arg` as a control id. When no view of the class gives a control that id — a typo, a renamed control, an id that only ever existed in another app — the lookup fails and the wire does **nothing**: no exception, no failed render, a button that looks connected. `CONTROL_BY_ID` at least logs the miss; `SET_FOCUS`, `SCROLL_TO`, `SCROLL_INTO_VIEW` and `KEYBOARD_SET_MODE` `return` without even a console line. Judged only when every `id` attribute of the class is a literal; a class that builds ids at runtime is left alone.',
    example: 'a( n = `id` v = `messageView` )\n\" … follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `messageview` ) ( `navigateBack` ) ) )',
  },
  'unknown-frontend-action': {
    category: 'abap2ui5',
    summary: 'a literal action name outside the frontend dispatch table',
    detail: 'A `client->_event_client( )` / `client->follow_up_action( )` naming its action as a string literal is dispatched exactly like the `cs_event-` constant — but the constant is compile-checked and the literal is not, and `FrontendAction.execute` looks the name up in its handler table and does **nothing at all** on a miss: no exception, not even a console line. Case matters — the runtime never upper-cases, so `set_title` misses where `SET_TITLE` works. Anything not name-shaped is `follow_up_action`\'s raw-JavaScript escape hatch and is not judged.',
    example: 'client->follow_up_action( val = `SET_TITEL` t_arg = VALUE #( ( `Hi` ) ) ).   " swallowed silently\n" instead:\nclient->follow_up_action( val = client->cs_event-set_title t_arg = VALUE #( ( `Hi` ) ) ).',
  },
  'unknown-view-slot': {
    category: 'abap2ui5',
    summary: 'a literal view slot outside MAIN / NEST / NEST2 / POPUP / POPOVER',
    detail: 'The `view` parameter (and `SET_SIZE_LIMIT`\'s view key) names one of the five slots, case-sensitively: the server compares it as an ABAP string and the browser uses it as an object key. The natural guesses all miss — `main` (lower case), and `NESTED` for `cs_view-nested`, whose VALUE is `NEST`. For `CONTROL_BY_ID` a wrong slot is worse than none: a named slot **suppresses the global id fallback**, so the wire dies although the id exists in an open view.',
    example: 'client->_event_client( val = client->cs_event-control_by_id\n                       view = `NESTED`   " cs_view-nested is NEST\n                       t_arg = VALUE #( ( `table1` ) ( `focus` ) ) ).',
  },
  'invalid-keyboard-shortcut': {
    category: 'abap2ui5',
    summary: 'a shortcut combo that names no key',
    detail: 'The registration normalizes the combo (`Ctrl+Shift+S` → `ctrl+shift+s`, aliases like `cmd`/`return` included) and refuses one that consists of modifiers only — logged once, never registered, and every later keydown simply does nothing. The scope argument is judged separately: a slot key or a declared control id (via `frontend-action-unknown-id`).',
    example: 't_arg = VALUE #( ( `Ctrl+Shift` ) ( `SAVE` ) )   " modifiers only — binds nothing\nt_arg = VALUE #( ( `Ctrl+Shift+S` ) ( `SAVE` ) )',
  },
  'invalid-action-payload': {
    category: 'abap2ui5',
    summary: 'a JSON action payload the runtime silently downgrades',
    detail: 'The `object`-kind control methods (`setSticky`, `setHiddenInPopin`, `setP13nData`) run their argument through `castArg`, whose catch turns a literal that does not parse as JSON into `{}` — a `setSticky` with a typo\'d payload then *un-sticks* everything instead of failing. For the enum-array payloads the values are judged too: an unknown `sap.m.Sticky` / `sap.ui.core.Priority` key is dropped by UI5 with the same silence. `BINDING_CALL`\'s compound filter-groups JSON is judged the same way, including each row\'s operator.',
    example: 't_arg = VALUE #( ( `table1` ) ( `setSticky` ) ( `ColumnHeaders` ) )      " not JSON -> {}\nt_arg = VALUE #( ( `table1` ) ( `setSticky` ) ( `["ColumnHeaders"]` ) )',
  },
  'popover-anchor-unknown-id': {
    category: 'abap2ui5',
    summary: '`popover_display( by_id = … )` anchored to an id no view declares',
    detail: 'A popover opens **by** a control — `by_id` names its anchor. With a literal id no view of the class declares, the fragment loads, `displayPopover` finds no `openBy` control, logs it and **destroys the fragment again**: nothing opens, nothing renders red, and the property gate saw a perfectly valid fragment. Judged under the same trust condition as `frontend-action-unknown-id` — only when every `id` attribute of the class is a literal.',
    example: ')->a( n = `id` v = `btnInfo` )\n\" …\nclient->popover_display( xml = popover->stringify( ) by_id = `btninfo` ).',
  },
  'get-viewname-removed': {
    category: 'abap2ui5',
    summary: '`client->get( )-viewname` — removed from `ty_s_get`',
    detail: 'The `VIEWNAME` component was removed from `z2ui5_if_types=>ty_s_get` (it always carried an empty string), so the read **no longer compiles** — but nothing in a systemless pipeline says so before activation: abaplint has no signature knowledge of the framework interfaces, and the render gate never sees the class fail. The same blindness `popover-display-val` covers.',
    example: 'DATA(viewname) = client->get( )-viewname.   \" no longer compiles',
  },
  'raw-javascript-to-frontend': {
    category: 'abap2ui5',
    summary: 'raw JavaScript shipped to the browser — via `follow_up_action` or the view',
    detail: 'abap2UI5\'s frontend is a **renderer**: behaviour travels as data (bindings, `cs_event-` actions), never as code. Three shapes break that line, and all three run unchecked in the browser, invisible to every gate and to anyone reading the ABAP: a non-name `val` in `follow_up_action( )` (the raw-JS escape hatch — inserted verbatim as `custom_js`), a hand-written handler string on an event attribute (UI5 evaluates it as JavaScript), and a `<script>` tag inside an attribute value (the `core:HTML` route). Use a `cs_event-` frontend action, a `client->_event*( )` wire or backend logic instead. A repo that deliberately allows the escape hatch can lower or disable the rule in its `abap2ui5lint.jsonc`.',
    example: 'client->follow_up_action( val = `sap.ui.getCore().byId(\'x\').focus()` ).   " raw JS\n)->a( n = `press` v = `z2ui5.oView.doSomething()` )                        " handler string\n" instead:\nclient->follow_up_action( val = client->cs_event-set_focus t_arg = VALUE #( ( `x` ) ) ).',
  },
  'json-bind-on-scalar-property': {
    category: 'abap2ui5',
    summary: 'a `json = abap_true` bind on a scalar-typed property',
    detail: '`_bind( json = abap_true )` splices the bound string into the model as a JSON **node** — built for properties typed `object`/`any` (an integration Card\'s manifest), which no typed ABAP value can be. On a `string`/`int`/`float`/`boolean` property the spliced node arrives as the wrong JSON type — strict mode and UI5 2.x reject it — and the splice is **outbound-only**: the return path skips json attributes, so an edit made through a two-way binding is silently discarded on the next roundtrip. Bind the plain attribute instead; json is for objects.',
    example: 'DATA manifest TYPE string.   " contains JSON\n)->a( n = `value` v = client->_bind( val = manifest json = abap_true )   " Input.value is string-typed',
  },
  'binding-type-mismatch': {
    category: 'data',
    summary: 'an ABAP character field bound to a numeric or boolean UI5 property',
    detail: 'The model ships JSON, so a `TYPE string` (or `c`, `n`, `d`) field arrives as `"100"` where the property declared a float. UI5 1.71 coerces it; UI5 2.x and the render gate\'s future mode reject the view outright (`"100" is of type string, expected float`). Declare the field with the matching ABAP type, or convert it before it reaches the model. Only reported when the field\'s type is known from the class\'s own declarations.',
    example: 'DATA percent TYPE string.\n" … )->a( n = `percentValue` v = client->_bind( percent )',
  },
  'date-type-without-source': {
    category: 'data',
    summary: '`sap.ui.model.type.Date` / `DateTime` / `Time` without `formatOptions.source`',
    detail: 'Without a `source` format option these types expect a **JS `Date` instance** in the model. An abap2UI5 model is JSON serialized from ABAP, so the value is always a string (or a timestamp number) and a `Date` can never reach it — the type raises a `FormatException` on the first `format()` and the field stays empty, with nothing in the console for a `Text`. Add the source format the ABAP field actually carries, e.g. `formatOptions: { source: { pattern: \'yyyy-MM-dd\' } }`. Note the alias form is resolved through the view\'s `core:require`, so `type: \'DateType\'` is judged like the full module name.',
    example: "a( n = `text` v = |\\{ path: '{ client->_bind( val = date path = abap_true ) }', type: 'DateType', formatOptions: \\{ style: 'short' \\} \\}| )",
  },
  'denied-control-method': {
    category: 'abap2ui5',
    summary: 'a `CONTROL_BY_ID` wire naming a method the frontend denylist refuses',
    detail: 'The wire\'s ALLOWED side is open by design — any public control method runs, so ordinary setters and toggles need no whitelist entry. The DENIED side is a closed set, and it is silent in the same way a wrong id is: `FrontendAction` logs "method not allowed" and returns, so the ABAP compiles, the view renders and the button does nothing. Denied are the methods that would break the framework\'s own invariants — teardown and reparenting (`destroy`, `exit`, `setParent`, `addDependent`, `placeAt`), model and binding swaps (`setModel`, `setBinding*`, `bind*`/`unbind*`), event-handler tampering (`attach*`/`detach*`, `fireEvent`), the render lifecycle (`rerender`, `invalidate`) and the GENERIC reflection mutators that take the member name as an argument (`addAggregation`, `removeAllAggregation`, `setAssociation`, …). The NAMED per-aggregation methods are allowed and are never reported: `removeAllItems` and `destroyContent` touch only children the control itself owns, exactly like the long-allowed `removeItem`.',
    example: 'follow_up_action( val = client->cs_event-control_by_id\n                  t_arg = VALUE #( ( `list` ) ( `destroy` ) ) )',
  },
  'binding-on-association': {
    category: 'abap2ui5',
    summary: 'a binding written into an association attribute',
    detail: 'Only properties and aggregations can be data-bound. `XMLTemplateProcessor` handles an association attribute by taking its value **verbatim as a control ID** (`createId(sValue)`, or a comma/space split for a 0..n association) — `BindingInfo.parse` is never called on it. So the braces travel into an id nothing answers to, the association stays empty, and neither the parser, the render gate nor the console says a word. Drive an association imperatively instead, with a `CONTROL_BY_ID` setter — which is also why `settable-property-via-action` deliberately never pushes an association towards a binding.',
    example: 'a( n = `selectedSection` v = client->_bind( section ) )   " association -> id "{/SECTION}"\n" follow_up_action( … t_arg = VALUE #( ( `opl` ) ( `setSelectedSection` ) ( section ) ) )',
  },
  'unknown-model': {
    category: 'abap2ui5',
    summary: 'a `name>` binding against a model the app does not have',
    detail: 'abap2UI5 serves exactly **one** data model per view slot — the default one, serialized from the class\'s PUBLIC attributes — plus the framework\'s own `device>` and `message>` (and `http>` on a switched path). A prefix outside that set resolves to no model at all, and UI5 leaves the property unset without a word. It is the most common leftover of a ported demo-kit sample, whose original names its models freely (`{ui>/rowMode}`, `{i18n>KEY}`): the fix is to fold the field into the default model with `client->_bind( )`, not to add a model — and there is no i18n model by design, because translation is a backend concern. A model registered by a `SET_ODATA_MODEL` wire of the same class counts as available; a class that registers one under a non-literal name is not judged at all.',
    example: 'a( n = `text` v = `{i18n>title}` )\na( n = `text` v = client->_bind( title ) )',
  },
  'settable-property-via-action': {
    category: 'abap2ui5',
    summary: 'a `CONTROL_BY_ID` `set…( )` where the control has a bindable property of that name',
    detail: 'The project rule is *prefer a bindable property over a frontend action*: a two-way bound property keeps the state in the model, where it survives a view rebuild, a draft restore and the browser Back button — a frontend action does not, and it also needs a round-trip to be re-applied. Only **properties** are reported: an association (`sap.uxap.ObjectPageLayout.selectedSection`) and an aggregation cannot be data-bound at all, so driving those imperatively is the only way and is never flagged. A hint, not an error — an imperative call can still be the right answer when the sample\'s point is the imperative API itself.',
    example: 'follow_up_action( val = client->cs_event-control_by_id\n                  t_arg = VALUE #( ( `sideContent` ) ( `setShowSideContent` ) ( `true` ) ) )\n\" -> a( n = `showSideContent` v = client->_bind( show_side ) )',
  },
  'relative-binding-without-context': {
    category: 'data',
    summary: 'a relative `{FIELD}` on a control that has no binding context',
    detail: 'A relative binding is resolved against the control\'s binding context. Inside a bound aggregation that context is the row; outside one there is none, and `JSONModel._getObject` returns `undefined` — the control renders **empty**, with no error anywhere. This is the flattened-element-binding trap: the original did `bindElement(\'/Coll/0\')`, the port seeded that record at the model root and kept the relative `{FIELD}`. Bind the root field instead (`client->_bind( field )`). Reported only when the name really is a field of the model root, so a per-row popup whose context arrives at runtime is not judged.',
    example: 'a( n = `title` v = `{NAME}` )   \" NAME is a root field -> renders empty\na( n = `title` v = client->_bind( name ) )',
  },
  'collection-bound-to-property': {
    category: 'data',
    summary: 'a table or structure bound to a scalar property',
    detail: 'The property receives an object where it expects a value. Nothing throws; the control shows nothing useful.',
  },
  'uncurated-formatter': {
    category: 'data',
    summary: "`formatter: 'Formatter.round2DP'` — not in the curated module",
    detail: "The framework ships ONE formatter module (`z2ui5/model/formatter`), and its export surface is deliberately tiny: a function is admitted only when it formats exactly the value handed to it and there is a technical reason it cannot be done in ABAP (a JS type the JSON model cannot carry, an icon-font glyph). UI5 resolves the formatter string at binding time, and an unknown name **silently yields no value** — the property is simply never set, the cell renders blank, nothing turns red. The demo-kit pack (`round2DP`, `dimensions`, `stockStatusState`, `stockStatusIcon`, `deliveryStatusState`) and `weightState` were shipped and then removed upstream, breaking their users exactly this way. If the value you need is not in the curated list, it is not a formatting problem: compute it in `model_init` and bind the finished field. Judged only for the framework's own alias (`Formatter` via `core:require`, or the `z2ui5.Formatter` global) — an alias pointed at your own module is left alone.",
    example: "a( n = `state` v = |\\{ path: 'STATUS', formatter: 'Formatter.stockStatusState' \\}| )  \" blank cell\na( n = `state` v = `{STATUS_STATE}` )  \" computed in ABAP, bound finished",
  },
  'missing-accessibility': {
    category: 'data',
    summary: 'an icon-only `Button` with no accessible name, a meaningful `Image` without `alt`',
    detail: 'The control is unusable with a screen reader. Both halves are judged the way UI5 itself treats them. A `Button` with an `icon` and no `text` has no accessible name — unless it carries a `tooltip` or an `ariaLabelledBy` association, either of which gives it one. An `Image` is the case that reads backwards: `decorative` **defaults to true**, and for a decorative image UI5 ignores `alt` entirely ("if the image is set to decorative, this property is ignored"). So an image without `decorative` is one the framework hides from screen readers on purpose, and asking it for an `alt` asks for an attribute UI5 drops — only an image the author declared MEANINGFUL with `decorative="false"` and then left unnamed is reported. Never wrong by itself, so it is a hint — switch it off per repo with `"missing-accessibility": false` if your corpus has made another decision.',
    example: 'view->leaf( `Image` )->a( n = `src` v = `logo.png` )->a( n = `decorative` v = `false` )   " no alt, no ariaLabelledBy',
  },
};
