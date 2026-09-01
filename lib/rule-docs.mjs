/*
 * rule-docs — the prose behind every rule id.
 *
 * The reference the rules page (site/index.html) and the README table are
 * generated from, so there is one place that says what a rule means. A
 * finding's one-line message lives in findings.mjs and has to stand on its own
 * in a terminal; what is here is the paragraph that does not fit there — why
 * the defect matters, and what the fix looks like.
 *
 * Published as the `./rule-docs` export, because the rules PAGE is not the only
 * place that needs the paragraph: an agent talking to mcp-server gets a rule id
 * back and has no browser to look it up in, and its editor has none either.
 * Adding a key here is additive; removing or renaming one is not (the exports
 * map is a contract — see AGENTS.md).
 *
 * Every id in findings.mjs `RULES` needs an entry; npm test fails otherwise.
 *
 *   category  which group the rule appears under (CATEGORIES below)
 *   summary   one line, the README table cell
 *   detail    the paragraph on the rules page
 *   example   the shortest source that triggers it — REQUIRED, and gated twice:
 *             `npm test` fails on a rule without one, and it fails again if a
 *             builder call inside one names a method the builder does not have.
 *             The README delegates all rule documentation to the generated
 *             page, so this IS the user-facing documentation: a paragraph
 *             saying a shape is wrong, without showing the shape, leaves the
 *             reader to guess which half of their line it meant.
 */

export const CATEGORIES = [
  { id: 'metadata', title: 'Controls and members', blurb: 'Everything the view writes, resolved against the UI5 metadata snapshot generated from the OpenUI5 sources.' },
  { id: 'structure', title: 'View structure', blurb: 'Defects in the shape of the document itself — several of them make the view builder assert before a view is ever produced.' },
  { id: 'version', title: 'Version and deprecation', blurb: 'Portability against the UI5 version your system actually runs (--ui5, default 1.71) and the distribution it serves (--distribution).' },
  /* The abap2UI5 half was one flat group of 54 — more than half the rule set
   * behind a single heading, which on a searchable page is the same as no
   * heading at all. It is four now, split by what the rule reads: the class's
   * own lifecycle, the wires it sends the frontend, what a binding addresses,
   * and how the chain is written. Nothing about the rules changed. */
  { id: 'lifecycle', title: 'abap2UI5 — the app class', blurb: 'The lifecycle and the API surface of the class itself: whether the view is ever displayed, whether the roundtrip finds it again, and whether the objects it names are ones abap2UI5 released.' },
  { id: 'frontend-wires', title: 'abap2UI5 — frontend wires', blurb: 'Everything travelling to the browser as an event or an action. The frontend resolves these against closed sets and, on a miss, mostly returns without a log — so a wrong wire is the quietest defect in the framework.' },
  { id: 'bindings', title: 'abap2UI5 — bindings', blurb: 'What a binding actually addresses once the framework has derived the client path from the ABAP name: whether the field exists, whether it survives the roundtrip, and whether the value arrives as the type the property expects.' },
  { id: 'layout', title: 'abap2UI5 — chain layout', blurb: 'How the builder chain is WRITTEN. The XML it emits is one line by construction, so the ABAP indentation is the only picture of the view tree that exists. All hints; the view renders identically either way.' },
  { id: 'data', title: 'Data and usability', blurb: 'The view loads and renders — but not with the data, or not for the user, the author had in mind.' },
];

export const RULE_DOCS = {
  /* ── controls and members ───────────────────────────────────────────── */
  'unknown-control': {
    category: 'metadata',
    summary: '`sap.m.Shell2` — no such control',
    detail: 'The control name is not in the metadata snapshot under any known library. Almost always a typo; UI5 fails to load the class and the view never appears. A control from a custom namespace is out of scope and never reported here.',
    example: 'view->tag( `Buton` )',
  },
  'unknown-property': {
    category: 'metadata',
    summary: '`Button typ="…"` — no such property, event or association',
    detail: 'The attribute does not exist on the control or anywhere in its inheritance chain. UI5 in future mode rejects the view. A control whose chain leaves the snapshot is never reported as missing a member — the linter does not guess. One caveat the message now carries: the metadata snapshot is a PIN, so a member released AFTER it is absent here and reports in exactly the shape a typo has. That verdict cannot be split without demoting every real typo with it, so the way out is the `allow` list, which suppresses any finding on one named `Control.member` — `"allow": ["sap.ui.unified.DateTypeRange.ariaHasPopup"]` — rather than switching the rule off for a whole repository.',
    example: 'view->tag( `Button` )->a( n = `typ` v = `Emphasized` )',
  },
  'unknown-aggregation': {
    category: 'metadata',
    summary: '`Page contentt` — no such aggregation',
    detail: 'An aggregation tag the parent control does not declare. UI5 then looks for a control class by that name and fails.',
    example: `view->ele( \`Page\` )->ele( \`contentt\` )->tag( \`Button\` )   " contentt: content`,
  },
  'invalid-property-value': {
    category: 'metadata',
    summary: '`Button type="Emphasised"` — outside `sap.m.ButtonType`',
    detail: 'The literal is not a member of the enum the property is typed with, or it is not a number on an int/float property, or not a boolean on a boolean one. UI5 in future mode refuses the view rather than falling back to a default. Bindings and expressions are never value-checked — their value is a runtime matter.',
    example: `view->tag( \`Button\` )->a( n = \`type\` v = \`Emphasised\` )   " Emphasized`,
  },
  'invalid-aggregation-child': {
    category: 'metadata',
    summary: 'a control the aggregation\'s type does not accept',
    detail: 'The aggregation declares a type, and the control put inside it does not inherit from it. UI5 refuses to add the child, so the part of the view below it silently disappears.',
    example: `view->ele( \`Table\` )->ele( \`columns\` )->tag( \`Button\` )   " columns takes sap.m.Column`,
  },
  'too-many-children': {
    category: 'metadata',
    summary: 'two controls in a 0..1 aggregation',
    detail: 'A single-cardinality aggregation was filled more than once. Only one child survives — which one is not something to rely on.',
    example: `view->ele( \`Page\`
    )->ele( \`customHeader\`
        )->tag( \`Bar\`
        )->tag( \`Bar\` )   " customHeader is 0..1 - one of the two is gone`,
  },
  'missing-required-aggregation': {
    category: 'data',
    summary: 'a `Table` bound to rows but given no `columns` — renders empty',
    detail: 'The control has data but not the aggregation it needs to show any of it. Nothing fails: the table renders, and it renders empty, which is the hardest kind of bug to see in a screenshot.',
    example: `view->ele( \`Table\` )->a( n = \`items\` v = client->_bind( t_rows ) )   " no columns: renders empty`,
  },

  /* ── view structure ─────────────────────────────────────────────────── */
  'excess-shut': {
    category: 'structure',
    summary: 'one `shut( )` more than the builder tree is deep',
    detail: 'The builder ascends past the root — one `end( )` too many. The builder asserts on it (`parent IS BOUND`), so the app dumps before it renders. The rule id keeps the older spelling `shut`: renaming it would silently invalidate every baseline entry and rule override that names it.',
    example: `view->ele( \`Page\`
    )->tag( \`Button\`
    )->end(
    )->end(
    )->end( )   " one end( ) past the root`,
  },
  'duplicate-property': {
    category: 'structure',
    summary: 'the same attribute written twice on one control',
    detail: 'The view builder asserts on a repeated attribute rather than letting the second value win silently.',
    example: `view->tag( \`Button\` )->a( n = \`text\` v = \`A\` )->a( n = \`text\` v = \`B\` )`,
  },
  'attribute-without-element': {
    category: 'structure',
    summary: '`a( )` on the bare factory root — nothing to attach it to',
    detail: 'An attribute call before any element was opened. There is no element to carry it, and the builder asserts.',
    example: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->a( n = \`title\` v = \`Hi\` )   " no element open yet`,
  },
  'duplicate-aggregation': {
    category: 'structure',
    summary: 'the same aggregation opened twice under one control',
    detail: 'The second tag replaces the first, so everything built into the first one is gone from the rendered view — without a word from anywhere.',
    example: `view->ele( \`Page\`
    )->ele( \`content\` )->tag( \`Button\` )->end(
    )->ele( \`content\` )->tag( \`Text\` )   " the Button is gone`,
  },
  'aggregation-in-aggregation': {
    category: 'structure',
    summary: 'an aggregation directly inside another one',
    detail: 'Invalid XML, and the signature of a missing `end( )`: UI5 goes looking for a control class by that aggregation name and fails.',
    example: `view->ele( \`Table\` )->ele( \`columns\` )->ele( \`footer\` )   " a missing end( ) between them`,
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
    example: `view->tag( \`Button\` )->a( n = \`id\` v = \`go\` )->tag( \`Text\` )->a( n = \`id\` v = \`go\` )`,
  },
  'undeclared-namespace': {
    category: 'structure',
    summary: '`ns = \'form\'` without an `xmlns:form`',
    detail: 'The prefix is used but never declared on the view root, so the parser cannot resolve the control at all.',
    example: `view->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )
    )->ele( n = \`SimpleForm\` ns = \`form\` )   " no xmlns:form on the root`,
    fixNote: 'For the conventional prefixes (`core`, `mvc`, `l`/`layout`, `form`, `f`, `table`, `u`/`unified`, `uxap`, `tnt`, `html`, `cc`) the missing declaration is inserted next to the root\'s first `xmlns` write; an unconventional prefix could mean any library and is left alone.',
  },
  'render-error': {
    category: 'structure',
    summary: 'the reconstructed view did not survive a real UI5 render',
    detail: 'Not a pattern the rules above match, but the outcome of actually loading the view in a headless UI5: whatever the browser said — a control class that will not load, an aggregation UI5 refuses, a binding it cannot parse. It is the render gate\'s pseudo-rule rather than an entry in `RULES`, so it is never emitted by a check; it appears only when `--render` ran and the browser objected. Address it in the config like any other id: `rules: { \'render-error\': false }` or an `exclude` waives it per file (a waived file that then renders clean is reported as a stale waiver), a severity re-weighs it.',
    example: 'rules: { \'render-error\': \'warning\' }',
  },
  'invalid-expression-binding': {
    category: 'structure',
    summary: 'unbalanced braces or parens in `{= … }`',
    detail: 'The expression binding cannot be parsed. UI5 reports a parse error and the attribute stays unbound.',
    example: `view->tag( \`Text\` )->a( n = \`text\` v = \`{= \${/N} > 1 ? \`many\` : \`one\` }}\` )   " one } too many`,
  },

  /* ── version and deprecation ────────────────────────────────────────── */
  'control-too-new': {
    category: 'version',
    summary: 'control introduced after your target UI5 version',
    detail: 'The control does not exist on the system you are targeting (`--ui5`, default 1.71), so the view will not load there — however well it works on a newer one. Waive a deliberate case with `--allow sap.m.Control`.',
    example: `view->tag( \`Avatar\` )   " @since 1.73, target 1.71`,
  },
  'member-too-new': {
    category: 'version',
    summary: 'property, event or aggregation introduced after your target version',
    detail: 'Same as `control-too-new`, one level down. Members without an `@since` count as always available — they predate version tracking. Waive with `--allow sap.m.Control.member`.',
    example: `view->tag( \`GenericTile\` )->a( n = \`systemInfo\` v = \`PRD\` )   " @since 1.92`,
  },
  'event-parameter-too-new': {
    category: 'version',
    summary: 'a `${$parameters>/name}` the event only gained later',
    detail: 'An event parameter read back in a `t_arg` that the event did not carry yet at your floor. Resolved per event, not per parameter name, so an identically named parameter on another event does not mask it.',
    example: `client->_event( val = \`SEARCH\` t_arg = VALUE #( ( \`\${$parameters>/searchButtonPressed}\` ) ) )   " @since 1.114`,
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
    example: 'view->tag( `Button` )->a( n = `type` v = `Critical` )  " @since 1.73 on a 1.71 target',
  },
  'aggregation-too-new': {
    category: 'version',
    summary: 'an aggregation TAG introduced after your target version',
    detail: 'The same mistake as `member-too-new`, with a far worse blast radius, which is why it is its own rule and an error. A post-floor **property** is dropped silently and the control still renders; a post-floor **aggregation** is a lowercase tag the release does not know, so UI5 falls back to resolving it as a control class and 404s on `sap/<lib>/<name>.js` — the whole view fails to load, not just the part below the tag. `<footer>` on a `sap.m.Dialog` is the recurring case: the public `footer` aggregation is ~1.110, so on 1.71 UI5 requests `sap/m/footer.js`. Use `buttons` (1.21.1); UI5 lays them out in an overflow toolbar by itself.',
    example: 'view->ele( `Dialog` )->ele( `footer` )  " @since 1.110 on a 1.71 target',
  },
  'source-line-too-long': {
    category: 'structure',
    summary: 'a source line over 255 characters — the class does not import',
    detail: 'ABAP holds 255 characters per source line, and over it the defect is not a lint finding but a failed **import**: abapGit reports "Literals across more than one line are not allowed" for the object and carries on with the next one, so what stays behind in the system is an **empty class stub**. The tree looks imported and the app is gone. Nothing else sees it — every check runs against the files, where the line is merely long. Split the literal into `&&` chunks; when the file is generated, fix the generator, or the next generation restores the line.',
    example: `DATA(html) = \`<div class="a">…</div>\` && \`…\`.   " one source line over 255 characters`,
  },
  'unknown-icon': {
    category: 'version',
    summary: '`sap-icon://textFormatting` — a glyph the font has in no release',
    detail: 'An unknown icon name is not an error anywhere: `IconPool` resolves it at render time, finds nothing, and the control renders with **no icon at all**. Nothing is logged — not in the browser console, not in ui5lint, not in abaplint — so it ships and surfaces months later as "not all icons are shown". Case matters and not in the way it looks: `IconPool.getIconInfo` parses the URI and reads `parts.hostname`, which is lower-cased, so `textFormatting` is not "nearly right" — it matches nothing, in every release, forever. The name is `text-formatting`. Judged against `data/icons.json`, the icon registry of every OpenUI5 minor from 1.71 up; a collection-qualified name (`sap-icon://tnt/actor`) belongs to a custom font and is never judged.',
    example: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://textFormatting` )',
  },
  'icon-too-new': {
    category: 'version',
    summary: 'an icon that reached the font after your target version',
    detail: 'The same silence as `unknown-icon`, one release boundary later: the glyph exists today and did not exist on the release you target, so the control renders without an icon there and nowhere else. `information` arrived in 1.80 (use `message-information`) and `clear-all` in 1.86 (use `eraser`) — both shipped past a green CI and were found by a user on 1.71. The registry\'s floor is 1.71, so a name already present there is recorded as "at or before" and a target below 1.71 is never judged.',
    example: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://information` )  " @since 1.80 on a 1.71 target',
  },
  'icon-removed': {
    category: 'version',
    summary: 'an icon that left the font again',
    detail: 'The font is nearly, but not quite, additive. `binary` was in the font for exactly one release — 1.104 — and gone again after it; the glyph is spelled `non-binary` (in the font since 1.96) everywhere else. A view written against that one release renders no icon on every release after it. Since a target version is a **floor**, the app also runs on the releases where the name is gone, which is why this is reported independently of the target.',
    example: `view->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://binary\` )   " in the font for 1.104 only; it is non-binary`,
  },
  'toolbar-control-in-bar': {
    category: 'version',
    summary: '`ToolbarSpacer`/`ToolbarSeparator` inside a `sap.m.Bar`',
    detail: 'The nastiest kind of version defect: every control and every property in the view exists on the target release, and it still renders wrong — only the CSS changed. `ToolbarSpacer` and `ToolbarSeparator` render a `<div>` and are laid out as intended only inside a `sap.m.Toolbar`, which is a flex container. `sap.m.Bar` is not, before 1.76: `.sapMBarLeft`/`.sapMBarRight` were `position: absolute` + `text-align` with the children in normal flow, where a block-level child **starts a new line** — and `.sapMBarContainer { overflow: hidden }` at the bar\'s 3rem height cuts away everything from that line on. So a separator between two groups of icons does not draw a rule: it **deletes every icon after it**, without a word. And a `Bar` is rarely written on purpose — `sap.m.Page` `headerContent` is forwarded into the internal Bar\'s `contentRight`, which is how this reached three overview headers at once. The fix is not a different separator, it is no separator: put only inline controls in a bar and express the grouping with a margin class (`sapUiMediumMarginBegin` on the first control of the next group). Reported only for a target below 1.76.',
    example: 'view->ele( `headerContent` )->tag( `ToolbarSeparator` )',
  },
  'control-deprecated': {
    category: 'version',
    summary: 'control already deprecated at your target version',
    detail: 'Reported only once the deprecation is in effect at the version you target — a control deprecated as of 1.149 stays silent for a 1.71 target.',
    example: `view->tag( \`Carousel\` )->a( n = \`loop\` v = \`true\` )   " with --ui5 at or above the deprecating release`,
  },
  'member-deprecated': {
    category: 'version',
    summary: 'property or event already deprecated at your target version',
    detail: 'As `control-deprecated`, per member. The replacement is usually named in the deprecation text the finding quotes.',
    example: `view->tag( \`Bar\` )->a( n = \`translucent\` v = \`true\` )`,
  },
  'sapui5-only-control': {
    category: 'version',
    summary: 'needs SAPUI5, absent from OpenUI5',
    detail: 'SAPUI5 ships libraries OpenUI5 does not — `sap.ui.comp` (Smart controls), `sap.suite.*`, `sap.ushell`, `sap.fe`, `sap.viz` — so a SmartTable is fine on SAPUI5 and a guaranteed runtime error on OpenUI5. The severity therefore follows what your config says about the target, and this is the only rule of which that is true: with `--distribution openui5` (or `"distribution": "openui5"`) it is an **error**, because the library provably is not there; with `--distribution sapui5` it is not reported at all, because you have said it is; and with no `distribution` configured it is a **hint** — the linter does not know which system the app deploys to, and a control only one distribution ships is worth knowing about either way. Configure `distribution` to turn the hint into the answer your repository actually needs.',
    example: `view->tag( n = \`SmartTable\` ns = \`smart\` )   " sap.ui.comp: SAPUI5 only — hint by default, error with --distribution openui5`,
  },

  /* ── abap2UI5 semantics ─────────────────────────────────────────────── */
  'unknown-binding-path': {
    category: 'bindings',
    summary: 'a hand-written `{/TYPO}` the derived model has no path for',
    detail: 'The field just stays empty — no error, anywhere. Inside a bound aggregation a relative `{TYPO}` is resolved against the row, so a misspelled column field is caught too, but only where the row shape is known from the class\'s `TYPES`. Never guessed.',
    example: `DATA name TYPE string.
…
view->tag( \`Text\` )->a( n = \`text\` v = \`{/NAEM}\` )   " the model has NAME`,
  },
  'binding-for-event': {
    category: 'bindings',
    summary: '`_bind( )` on an event — a dead control',
    detail: 'The slot is an event, so a data binding in it never becomes a handler. The control renders and does nothing. Use `client->_event( )`.',
    example: `view->tag( \`Button\` )->a( n = \`press\` v = client->_bind( name ) )   " _event( ), not _bind( )`,
  },
  'event-for-property': {
    category: 'bindings',
    summary: '`_event( )` on a property',
    detail: 'The mirror image: an event handler written into a data slot. Use `client->_bind( )`.',
    example: `view->tag( \`Text\` )->a( n = \`tooltip\` v = client->_event( \`GO\` ) )   " _bind( ), not _event( )`,
  },
  'frozen-view-builder': {
    category: 'lifecycle',
    summary: 'the class builds its view with the deprecated `z2ui5_cl_xml_view`, so the view was not checked at all',
    detail: 'This is the only finding here about what was *not* judged. `z2ui5_cl_xml_view` is **deprecated**: it was the abap2UI5 view builder until `z2ui5_cl_ui5_view_builder` replaced it, and it moved into the frozen `src/99` rather than being deleted — kept solely so existing installations keep compiling, with no compatibility promise and no deprecation cycle before it goes. So a class written on it still compiles and still renders, and nothing anywhere raises an eyebrow. This linter reconstructs a view from the current builder\'s five verbs (`ele`, `tag`, `a`, `end`, `stringify`); the old API is a different one, so there is no view to judge and every other rule is silent for lack of anything to read. Until this rule existed the file was not even collected: an entire app on the retired builder came back as "no checkable app classes" and exit 0, which reads like approval. It matters more than it used to, because the old API is what almost all public abap2UI5 material shows and therefore what a language model reproduces when asked to write an app — the wrong answer arrives already looking like the right one. Rewrite the chain on `z2ui5_cl_ui5_view_builder` and the whole gate applies again. Reported as a warning rather than an error, for the reason the deprecation itself gives: the app works today and breaks on an upgrade, which is what a warning means everywhere else here. An app that is deliberately staying on the old builder for now says so once, in its config: `"rules": { "frozen-view-builder": "hint" }`, or `false` to switch it off.',
    example: 'DATA(view) = z2ui5_cl_xml_view=>factory( ).   " deprecated — nothing below this line is checked\nview->page( )->button( text = `hi` ).',
  },
  'non-released-api': {
    category: 'lifecycle',
    summary: 'an abap2UI5 object outside the released `src/02` package',
    detail: 'abap2UI5 releases exactly one package — `src/02`, six objects: `z2ui5_if_app`, `z2ui5_if_client`, `z2ui5_if_exit`, `z2ui5_if_types`, `z2ui5_cl_ui5_http_handler`, `z2ui5_cl_ui5_view_builder`. Everything else the repository ships says in its own package description that it is not for consumers: `src/01` is "abap2UI5 — internal use only", `src/99` is frozen legacy that "ships solely so existing downstream installations keep compiling", and `src/00` holds renamed copies of AJSON, S-RTTI and abap-util. None of them carries a compatibility promise or announces a change: one upstream commit renamed the entire core layer (`z2ui5_cl_core_*` → `z2ui5_cl_ui5_*`) and moved the old view builder and HTTP handler into the frozen package on the same day. An app that names one of those compiles today and fails to activate after the next `abapGit` pull, with no deprecation in between — and nothing in a systemless pipeline says so beforehand. Judged only against names the linter knows are framework objects (the frozen package by name, the internal packages by the prefixes upstream reserves), so your own `z2ui5_`-prefixed classes are never reported. `z2ui5_if_types` is released rather than merely tolerated, which matters because the released `z2ui5_if_client~get( )` returns `z2ui5_if_types=>ty_s_get` — an app that declares a variable of that type cannot avoid the name.',
    example: 'DATA(json) = z2ui5_cl_ajson=>create_empty( ).      " vendored copy, renamed on the next sync\nz2ui5_cl_pop_to_confirm=>factory( ).                " frozen — use the popups addon\nDATA(html) = z2ui5_cl_util=>xml_stringify( data ).  " retired utility class',
  },
  'chain-indentation': {
    category: 'layout',
    summary: 'a builder call whose indentation contradicts the tree it builds',
    detail: 'A builder chain is the one part of an abap2UI5 class that nothing else formats: abaplint has `indentation` and `in_statement_indentation` switched off (a chain is a single statement spanning fifty lines), so neither `abaplint --fix` nor the auto-format workflow ever touches its inner lines. And the reader has no other picture of the view — the XML the builder emits is one long line by construction, so **the ABAP indentation IS the view\'s structure**. When it drifts, the tree in the file stops matching the tree in the browser. What is judged is only that: a sibling written at a different column than the siblings it shares a parent with, or a call written to the LEFT of the element it belongs to. The SIZE of the indent step is not judged — two and four are both house styles in the wild, and the first child under a node defines the column its siblings are held to, so a chain that keeps its own rhythm is never reported. Neither is the column of `end( )` (the hanging close is established), nor `v =` alignment, nor line length, nor a chain written entirely on one line. A hint: the view renders identically either way.',
    example: ')->ele( `Page`\n    )->tag( `Input`\n  )->tag( `Button`   " a sibling of Input, written a level out',
  },
  'chain-element-per-line': {
    category: 'layout',
    summary: 'several controls on one line of a multi-line chain',
    detail: 'One element per line is what makes the indentation able to show the tree at all — a line holding three controls hides three levels of it. Only ELEMENTS count: an attribute on the same line as the control it belongs to hides nothing, so `)->tag( `Text` )->a( n = `text` v = `{TITLE}` )` is the compact one-control form half the samples (and abap2UI5\'s own startup app) are written in and is never reported. Closing calls do not count either, because `)->end( )->end( ).` as a chain\'s last line is an established ending. Reported only for a chain already written across several lines, so the one-liner stays available. A hint, like its neighbour.',
    example: ')->tag( `Input` )->tag( `Button` )->tag( `Text` )   " three controls, one line',
  },
  'chain-house-layout': {
    category: 'layout',
    summary: 'a chain not in the abap2UI5 house layout (opt-in)',
    detail: 'The only rule here that encodes a HOUSE STYLE rather than an inconsistency, and the only one that names a step. Its two neighbours judge a chain against itself and stay silent on any layout that is merely a choice; this one judges it against one canonical form: **one call per line including attributes** (stricter than `chain-element-per-line`, which lets an attribute share its control\'s line), **four spaces per level of the tree**, and the closing call alone in the column of the element it closes. It exists because that form now has a corpus behind it — abap2UI5, abap2UI5/samples and abap2UI5/samples-controls were unified onto it in 2026-08, and the drift it catches had passed every other gate: 77 ports whose whole chain sat one level too deep, which `chain-indentation` cannot see because a uniformly wrong rhythm is still a rhythm. **If your house style is a different one, switch it off** — `"chain-house-layout": false` — rather than reformatting to somebody else\'s taste. Every finding carries fixes, so `--fix` rewrites the chain; the rewrite only ever touches whitespace between chain segments and the indent of a continuation line that is not itself content, so it cannot change what the view builds.',
    example: ')->ele( `Shell` )->ele( `Page` )      " two levels on one line, and the step is 0\n)->tag( `Text` )->a( n = `text` v = `x` )   " attribute on its control\'s line',
    fixNote: 'The chain is rewritten into the canonical layout: each call moved onto its own line at the column its depth in the tree gives it, and the continuation lines of a call\'s arguments moved with it. Only whitespace BETWEEN chain segments is touched — a literal, a comment\'s text and the inside of an argument list are copied through, and blank lines and comment lines between segments are kept where they are. The rewrite is checked to be whitespace-only before it is offered, so it cannot change what the view builds.',
  },
  'obsolete-binder': {
    category: 'lifecycle',
    summary: '`client->_bind_edit( )` — superseded by `client->_bind( )`',
    detail: '`_bind` is two-way as well, and `_bind_edit` is a pure alias for it. A call passing `custom_mapper_back` or `custom_filter_back` used to be exempt, because `_bind` has no such parameters — that exemption is gone with the parameters\' meaning: they are still accepted for source compatibility but no longer evaluated, per-direction mapping does not exist any more. Such a call is reported like every other, but without the autofix: the arguments have to go with the rename, and dropping an argument is not a rename.',
    example: 'a( n = `value` v = client->_bind_edit( name ) )   " → client->_bind( name )',
    fixNote: 'Rewritten to `client->_bind( )`, the arguments untouched — except where the call passes `custom_mapper_back`/`custom_filter_back`, which is reported without a fix.',
  },
  'obsolete-bind-argument': {
    category: 'lifecycle',
    summary: '`_bind( view = … )` and the `custom_mapper`/`custom_filter` pair',
    detail: 'Two arguments the binder still ACCEPTS and should no longer be given. `view` is "inactive, not passed on internally": a call scoping a binding to `cs_view-popup` reads as if the binding belonged to that slot, and nothing reads the value at all — so it is dead weight that documents a behaviour the framework does not have. `custom_mapper` and `custom_filter` are the opposite, and worse: they are still evaluated, but both hand the app a reference to the AJSON copy bundled in `src/00` — a mirror of an external project, not a contract abap2UI5 owns — so an app implementing `z2ui5_if_ajson_mapping`/`_filter` binds itself to whatever that mirror looks like today. That is the `non-released-api` argument one level down, at a parameter rather than a class name. Everything they were reached for is declarative on the method now: `omit_initial`/`omit_initial_paths` drop initial fields and `json` splices a JSON node.',
    example: 'a( n = `value` v = client->_bind( val = name view = client->cs_view-popup ) )',
    fixNote: 'The inactive `view` argument is deleted, together with the spaces behind it; a value carrying parentheses is an expression whose end this pass does not measure and is reported without a fix. The mapper pair never carries one — they are still evaluated, so dropping one changes what the model carries.',
  },
  'obsolete-model-update': {
    category: 'lifecycle',
    summary: '`view_model_update( )` & friends — empty methods, the model is pushed automatically',
    detail: 'The framework compares the model state before `main( )` with the state after it returned and, when they differ, sends it to every open view slot by itself. `view_model_update( )`, `nest_view_model_update( )`, `nest2_view_model_update( )`, `popup_model_update( )` and `popover_model_update( )` are therefore deliberately **empty** methods, kept in `z2ui5_if_client` only so existing apps keep compiling. A leftover call is not merely dead weight — it reads as "the model is pushed here" at a place where nothing at all happens. Delete it. The one thing that went with them is the ability to force an *unchanged* model back onto the client (a control that wrote a bound property without sending it back): rebuild the view with `view_display( )` for that.',
    example: 'client->popup_model_update( ).   " does nothing — delete it',
    fixNote: 'The call is deleted, together with the line when it has that line to itself; a line shared with other code or a trailing comment keeps everything but the call.',
  },
  'obsolete-frontend-event': {
    category: 'lifecycle',
    summary: '`client->_event_client( )` — superseded by `client->follow_up_action( )`',
    detail: 'The same call, with the same `val` / `view` / `t_arg`. Since `follow_up_action( )` gained a `RETURNING` parameter it is the same call in the same *position* too: where its result is consumed — the view-attribute form `v = client->_event_client( … )` — it takes the `IF result IS SUPPLIED` branch straight to `mo_srv_event->get_event_client( )`, which is `_event_client( )`\'s entire body. One method now both schedules a frontend action and wires one, so the second name is a leftover. The one non-equivalence is `follow_up_action( )`\'s `CASE`, which intercepts `cs_event-set_nav_routing` / `set_push_state` / `set_app_state_active` before that branch: those three are backend-side navigation options, not frontend handlers, so a view attribute wired to one of them never dispatched anyway.',
    example: 'a( n = `press` v = client->_event_client( val = client->cs_event-popup_close ) )\na( n = `press` v = client->follow_up_action( val = client->cs_event-popup_close ) )',
    fixNote: 'Rewritten to `client->follow_up_action( )`, the arguments untouched.',
  },
  'unconverted-abap-boolean': {
    category: 'bindings',
    summary: 'an ABAP boolean written straight into the view',
    detail: 'It arrives as `\'X\'` or `\' \'`, and UI5 reads any non-empty string as true — so `visible = abap_false` makes the control **visible**. The classic silent inversion. The way out is the builder\'s own boolean parameter: `z2ui5_cl_ui5_view_builder` takes the flag through `a( b = … )`, which renders `true`/`false` itself.',
    example: `view->tag( \`Button\` )->a( n = \`visible\` v = flag )         " 'X' / ' ' - both truthy
view->tag( \`Button\` )->a( n = \`visible\` b = flag )         " the builder renders true/false`,
    fixNote: 'A bare token is moved onto the boolean parameter — `a( v = flag )` becomes `a( b = flag )`; an expression is left alone.',
  },
  'binding-to-local': {
    category: 'bindings',
    summary: 'a local variable bound',
    detail: 'The instance is serialized across the roundtrip, the method stack is not — so the value is gone when the answer comes back. Bind an instance attribute.',
    example: `METHOD z2ui5_if_app~main.
  DATA lv_title TYPE string.
  view->tag( \`Text\` )->a( n = \`text\` v = client->_bind( lv_title ) ).   " gone after the roundtrip`,
  },
  'binding-to-nonpublic': {
    category: 'bindings',
    summary: 'a PROTECTED/PRIVATE attribute bound',
    detail: 'Only PUBLIC attributes are serialized into the model (`z2ui5_cl_ui5_srv_model` filters on visibility), so binding one from another section fails the **first roundtrip** with `BINDING_ERROR — No class attribute for binding found`. Move the attribute to the `PUBLIC SECTION`. Judged by the root of the bound name (a structure component travels with its root), and only when the class declares a `PUBLIC SECTION` to compare against. Found live: an samples-controls port bound `expanded` from its PROTECTED section and had never worked in a running system — its `LIVE_TEST` deviation was telling the truth the whole time.',
    example: 'PROTECTED SECTION.\n  DATA expanded TYPE abap_bool.   " BINDING_ERROR on the first roundtrip\n" … )->a( n = `expanded` v = client->_bind( expanded ) )',
  },
  'ui5-internal-access': {
    category: 'frontend-wires',
    summary: '`mProperties` & friends — private UI5 internals',
    detail: 'The `mProperties`/`mAggregations`/`mBindingInfos`/`mEventRegistry` member tables are UI5 implementation details with no API contract — they are renamed or restructured across UI5 patches without notice, so a wire or expression that reads them works on the version it was written against and breaks silently on the next one. Restructure to a two-way binding or a public parameter.',
    example: `client->follow_up_action( client->_event_client(
    val   = client->cs_event-control_by_id
    t_arg = VALUE #( ( \`list\` ) ( \`mProperties\` ) ) ) )`,
  },
  'commercial-ui5-host': {
    category: 'version',
    summary: 'a URL pinned to the commercial SAPUI5 host',
    detail: 'The same portability family as `sapui5-only-control`: `sdk.openui5.org` serves the open distribution, `ui5.sap.com` / `*.hana.ondemand.com` serve SAPUI5. An app whose assets or bootstrap point at the commercial host breaks the moment it runs against an OpenUI5-only landscape.',
    example: `DATA(url) = \`https://ui5.sap.com/resources/sap-ui-core.js\`.   " sdk.openui5.org serves the open one`,
  },
  'relative-asset-url': {
    category: 'version',
    summary: 'a document-relative asset URL, which an abap2UI5 app has no root to resolve',
    detail: 'A UI5 demo-kit sample is served from the SDK page, so `./test-resources/sap/uxap/images/x.png` resolves there. An abap2UI5 app is served from the ABAP ICF node and has no such document root: the request 404s and the control silently falls back to its placeholder — the view renders, and nothing is logged where anyone looks. Judged on the metadata type (`sap.ui.core.URI`), not on attribute names, so `src`, `icon`, `backgroundImage`, `objectImageURI` and `fontURI` are reached alike. Scoped to the two demo-kit trees that are always wrong (`test-resources/…`, `resources/sap/…`): a project serving its own ICF resources may legitimately write a relative path. A binding is never judged — what the model holds is a runtime question.',
    example: '<Image src="./test-resources/sap/uxap/images/imageID.png"/>\n" -> prefix the OpenUI5 host (sdk.openui5.org) so the path is absolute',
  },
  'view-never-displayed': {
    category: 'lifecycle',
    summary: 'a view is built but never handed to the client',
    detail: 'An empty page and no error: the builder ran, the result was never passed to `client->view_display( )` (or a nested-view, popup, popover or nav call).',
    example: `METHOD z2ui5_if_app~main.
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( \`Page\` )->tag( \`Button\` ).
ENDMETHOD.   " no client->view_display( view->stringify( ) )`,
  },
  'event-arg-out-of-range': {
    category: 'frontend-wires',
    summary: '`get_event_arg( n )` past the `t_arg` the event declares',
    detail: 'The arguments are static — they are written at the raise site — so reading past them is never anything but a mistake: initial in ABAP, a 500 in the transpiled runtime, and either way not the value the handler works with. Judged only for a literal index, inside the handler of an event the class raises itself with `client->_event( )`, and never across a method boundary: an event arriving from a `message_box_display( onclose = )` callback or a frontend action carries arguments from a source this pass cannot see.',
    example: 'client->_event( val = `PICK` t_arg = VALUE #( ( `${$source>/id}` ) ) )\n" … WHEN `PICK`. client->get_event_arg( 2 )',
  },
  'invalid-frontend-action': {
    category: 'frontend-wires',
    summary: 'a frontend-action `t_arg` outside the set the runtime accepts',
    detail: 'A `client->_event_client( )` / `client->follow_up_action( )` wire is dispatched in the browser by name, and a name outside the whitelist raises nothing anywhere: FrontendAction logs to the console and the control does nothing when pressed. Judged only for literal arguments and only where the runtime\'s set is closed — the `CONTROL_GLOBAL` object and its method, the `BINDING_CALL` method, and `CONTROL_BY_ID`\'s obsolete empty view slot (which shifts the method out of position). `CONTROL_BY_ID`\'s method list is open by design and is never judged.',
    example: 'client->_event_client( val   = client->cs_event-control_global\n                       t_arg = VALUE #( ( `MESSAGE_TOASTER` ) ( `show` ) ( `hi` ) ) )',
  },
  'collapsed-brace-in-style': {
    category: 'bindings',
    summary: 'an escaped CSS brace written inside a `|…|` template',
    detail: 'An escape only reaches the serialized attribute when the backslash is taken verbatim, which is what a backtick literal does. Inside an ABAP string template the backslash is the template\'s own escape: `\\{` collapses to a bare `{` before the builder ever sees it, and the view dies exactly as if nothing had been escaped. Write the stylesheet in a backtick literal — or, if it has to be a template, double the backslash (`\\\\\\{`). Invisible to `unescaped-brace-in-style`, which reads the source and sees a backslash in front of every brace; only the literal\'s kind tells the two apart.',
    example: 'DATA(css) = |<style>.a \\{color:red\\}</style>|.  " collapses\nDATA(ok)  = `<style>.a \\{color:red\\}</style>`.  " survives',
  },
  'unused-public-attribute': {
    category: 'lifecycle',
    summary: 'a PUBLIC attribute nothing in the class ever touches',
    detail: 'Only PUBLIC attributes are serialized into the model (`z2ui5_cl_ui5_srv_model` filters on visibility), so every one of them is shipped to the browser on every roundtrip. One that is never bound, never read and never written is pure transport weight. Deliberately narrower than "not bound in any view": an attribute used only in ABAP code is not dead, it is *state* — PUBLIC is precisely how a value survives the roundtrip. Only a name that appears exactly once in the whole class, its own declaration, is reported, and only as a hint: an attribute can still be read from outside the class, which no single source file can see.',
    example: `PUBLIC SECTION.
  DATA mv_note TYPE string.   " and mv_note appears nowhere else in the class`,
  },
  'unescaped-brace-in-style': {
    category: 'bindings',
    summary: 'literal CSS braces in a `<style>` block',
    detail: 'UI5\'s XMLView parser reads an unescaped `{` in an attribute value as the start of a binding, so a stylesheet injected through a `core:HTML` content attribute takes the whole view down with a binding parse error. Write every brace as `\\{` and `\\}`. Judged between `<style>` and `</style>`, so a `{0}` toast template or a `${$parameters>/…}` wire elsewhere in the same builder chain is never mistaken for CSS.',
    example: 'DATA(css) = `<style>.box \\{color:red\\}</style>`.',
  },
  'escaped-brace-in-backtick': {
    category: 'bindings',
    summary: 'a binding written with escaped braces inside a `backtick` literal',
    detail: "Brace escaping is a |…| TEMPLATE rule. In a template the backslash is ABAP's own escape, so `\\{` reaches the builder as a bare `{` — which is exactly what a binding needs. A `backtick` literal has no escape processing at all: the backslash is taken verbatim and lands in the serialized attribute, where UI5 reads `\\{ path: … \\}` as text rather than a binding and either renders it raw or fails to parse the view. Write plain braces in a backtick literal; keep the escapes for the template form.",
    example: "a( n = `items` v = `\\{ path: 'message>/' \\}` )   \" the backslash reaches the XML\na( n = `items` v = `{ path: 'message>/' }` )     \" correct in a backtick literal\na( n = `items` v = |\\{ path: '{ p }' \\}| )       \" correct in a template",
    fixNote: 'Every backslash in front of a brace inside the backtick literal is deleted, leaving the plain-brace form the literal should have carried. Nothing else in the literal is touched — a backtick literal has no escape processing, so the backslashes say nothing.',
  },
  'popover-display-val': {
    category: 'frontend-wires',
    summary: '`popover_display( val = … )` — the parameter is `xml`',
    detail: 'The one asymmetry in the display family: `popup_display( )` imports `val`, `popover_display( )` imports `xml`. A `val =` guessed by analogy does not compile — but nothing in a systemless pipeline says so before activation, so the mistake rides along until the class first meets a compiler. One of the most common first-try mistakes in generated code.',
    example: 'client->popover_display( val = popover->stringify( ) ).  " does not compile\nclient->popover_display( xml = popover->stringify( ) ).  " correct',
    fixNote: 'The parameter name is rewritten to `xml`, the argument untouched.',
  },
  'hardcoded-binding-path': {
    category: 'bindings',
    summary: "an absolute binding path written as text — `{/PATH}` or `path: '/PATH'`",
    detail: "The runtime only registers what `client->_bind( )` was given, so a textual path either addresses nothing (that half is `unknown-binding-path`) or duplicates a bind that exists elsewhere — and then silently breaks the moment the attribute is renamed, because no compiler follows a string. Derive the path instead: `client->_bind( var )` for the `{binding}`, or the bare-path form `client->_bind( val = var path = abap_true )` interpolated into a binding-info template. An OData entity path with a key predicate (`{/Products('4711')}`) in a class that switches its default model to an OData service is exempt — that path addresses the service, not an ABAP variable.",
    example: "a( n = `title` v = `{/TITLE}` )                        \" breaks on rename\na( n = `title` v = client->_bind( title ) )            \" moves with the variable",
  },
  'missing-view-display-on-navigated': {
    category: 'lifecycle',
    summary: 'a `check_on_navigated( )` branch that never re-displays the view',
    detail: "When a called app leaves, the browser still shows THAT app's view — returning control alone changes nothing on screen. The `check_on_navigated( )` branch has to hand a view back with `client->view_display( )`. A branch that only reads the result and falls through leaves the screen showing the wrong app, with no error anywhere. `view_model_update( )` used to count as a re-display here and no longer does: it is an empty method now (`obsolete-model-update`), and the automatic model push that replaced it reaches the MAIN slot — which is still holding the called app's view.",
    example: 'ELSEIF client->check_on_navigated( ).\n  result = client->get_app( client->get( )-s_draft-id ).\n  client->view_display( render_view( ) ).  " without this: the sub-app stays on screen',
  },
  'missing-on-navigated-branch': {
    category: 'lifecycle',
    summary: 'a lifecycle dispatcher with no `check_on_navigated( )` branch at all',
    detail: "`check_on_init( )` means \"this app INSTANCE never ran\", not \"the app starts\" — abap2UI5 flips the flag after the very first roundtrip. So it is false on three roundtrips that put the app back on screen: a called app leaving through `nav_app_leave( )`, one of the built-in `z2ui5_cl_pop_*` value helps returning (those run over `nav_app_call` too), and a bookmarked draft being restored. All three raise `check_on_navigated( )` alone; with no branch for it `main( )` does nothing, the response carries no display, and the model is pushed into a MAIN slot still holding the other app's view. The screen stays wrong with no error anywhere — which is why an app written this way works perfectly until the day something navigates into it. This is the complement of `missing-view-display-on-navigated`, which judges a branch that exists but never displays; the two never fire on the same class. An app whose display is not gated by the lifecycle at all — a `view_display( )` after the `IF`/`ELSEIF` chain, or the `client->nav_app_leave( )` a popup helper ends on — is correct as it stands and is not reported.",
    example: 'IF client->check_on_init( ).\n  model_init( ).\n  view_display( ).\nELSEIF client->check_on_navigated( ).  " without this the app goes blank after a hop\n  view_display( ).\nELSEIF client->check_on_event( ).\n  on_event( ).\nENDIF.',
  },
  'separate-lifecycle-ifs': {
    category: 'lifecycle',
    summary: 'lifecycle checks in separate `IF` blocks instead of one `IF`/`ELSEIF` chain',
    detail: 'The lifecycle flags (`check_on_init`, `check_on_event`, `check_on_navigated`, …) are not all mutually exclusive, so separate `IF` blocks can execute more than one branch on a single roundtrip — the classic symptom is work done twice after a navigation. One `IF`/`ELSEIF` chain makes the branches exclusive by construction. The guard idiom is exclusive too and is never reported: an `IF` block that leaves the method (`IF client->check_on_event( \\`GO\\` ). … RETURN. ENDIF.`) cannot flow into the next block.',
    example: 'IF client->check_on_init( ).\n  " …\nELSEIF client->check_on_navigated( ).  " ELSEIF, not a second IF\n  " …\nENDIF.',
  },
  'escape-sequence-in-backtick': {
    category: 'data',
    summary: 'a `\\n` written in a `backtick` literal, which has no escapes',
    detail: 'An ABAP `` `backtick` `` literal is RAW: `\\n` inside it is a backslash followed by an `n`, and nothing further down the chain turns it into a line break — the client\'s `formatTemplate` substitutes `{N}` placeholders and passes everything else through. So a toast built as `` `value - {0}, \\n action - {1}` `` renders the two characters on screen, where the original (a double-quoted JS string, shown through `.sapMMessageToast`\'s `white-space: pre-line`) breaks the line. The `|…|` STRING TEMPLATE is the ABAP form that does process escapes, so the working spelling concatenates one. Scoped to text that reaches the user — an attribute value and the on-screen message helpers — rather than to every backtick literal: a backslash is legitimate in a regex pattern and in a Windows path, and nobody reads those. A doubled backslash is never reported; whoever wrote it meant a backslash.',
    example: 'client->message_toast_display( `saved,` && |\\n| && ` and closed` )   \" not `saved,\\n and closed`',
  },
  'unresolved-attribute-value': {
    category: 'metadata',
    summary: 'an enum-typed attribute whose value the reconstructor could not follow',
    detail: 'A builder attribute written with a value this gate cannot resolve — a `COND #( )`, a variable, a concatenation — is DROPPED from the reconstructed document, so every rule downstream is blind to it. That blind spot is mostly paid for: the attribute NAME is still known, which is all a version check needs, so `member-too-new` judges it anyway. What cannot be paid for is a CLOSED SET. An enum-typed property is the one member whose value the gate would otherwise have decided outright, and UI5 rejects a value outside the enum by taking the whole view down — so the one check that mattered here went with the value. Deliberately scoped to enum-typed properties: reporting every unresolved attribute would name a blind spot on almost every conditional attribute in a corpus, which is a statistic rather than a finding.',
    example: 'a( n = `state` v = COND #( WHEN ok THEN `Success` ELSE `Error` ) )   " ValueState, unchecked',
  },
  'value-header-default-reassigned': {
    category: 'lifecycle',
    summary: 'a `VALUE` component assigned in the header and again in a row',
    detail: 'A component assigned before the first line spec is a DEFAULT for all following lines, not an overridable one, so assigning it again inside a row makes the system\'s syntax check refuse the whole constructor: *"The component was specified more than once."* abaplint accepts the construct without a finding — its `VALUE` grammar does not model the one-assignment rule — so this reached a repository\'s main branch through a green CI and was found by a user running Code Inspector\'s SYNTAX_CHECK over a pulled copy. Write the value per row instead, or close the header\'s scope with a second group: the default binds only to the lines *after* it.',
    example: 'VALUE #( selectable = abap_true ( a = 1 ) ( a = 2 selectable = abap_false ) )',
  },
  'into-corresponding-inline-decl': {
    category: 'lifecycle',
    summary: '`INTO CORRESPONDING FIELDS OF TABLE @DATA(…)` — 7.55 syntax',
    detail: 'Below 7.55 the system refuses the class with *"Inline data declarations cannot be used together with INTO CORRESPONDING additions"*, plus one follow-up *"Field … is unknown"* for every later read of the table that was never declared — three errors whose cause is the first one. abaplint stays green because its SELECT grammar puts no version gate on the inline declaration (measured at `syntax.version` v750 with `check_syntax` and `downport` on, control probe fired). Plain `INTO TABLE @DATA(…)` is fine from 7.40 on; it is only the combination with `CORRESPONDING` that is late. Declare the table with `DATA … TYPE STANDARD TABLE OF … WITH EMPTY KEY` and select into it.',
    example: 'SELECT * FROM scarr INTO CORRESPONDING FIELDS OF TABLE @DATA(lt_carr).',
  },
  'class-constructor-visibility': {
    category: 'lifecycle',
    summary: '`class_constructor` declared outside the `PUBLIC SECTION`',
    detail: 'The static constructor is called by the runtime itself, so its visibility is not a design choice: the compiler requires it public and a class declaring it PROTECTED or PRIVATE does not activate. Nothing in a systemless pipeline sees that — the class lints, the tests run, and the error appears the first time somebody imports the transport.',
    example: 'PRIVATE SECTION.\n  CLASS-METHODS class_constructor.   \" → PUBLIC SECTION',
  },
  'redundant-conv-i': {
    category: 'lifecycle',
    summary: '`CONV i( )` assigned to a target that is already `TYPE i`',
    detail: 'The assignment converts by itself, so the `CONV` says nothing and reads as if a conversion were needed; SLIN reports *"Redundant conversion for type I"*. Both halves of the scoping are load-bearing and were measured before this shipped: the target has to be declared IN THIS FILE (a type living in another class is left alone rather than guessed at), and the `CONV` has to be the ENTIRE right-hand side — one inside a comparison or an arithmetic expression is load-bearing or at least arguable, and one inside a string template (`|{ CONV i( x ) WIDTH = 2 }|`) is a real conversion. All three were false errors in the first draft. A hint: the code is correct, and this is an extended-check finding rather than a defect.',
    example: 'DATA count TYPE i.\ncount = CONV i( lv_text ).   \" count = lv_text.',
    fixNote: 'The `CONV i( … )` wrapper is unwrapped to its inner expression. Safe by the rule\'s own scoping: the CONV is guaranteed to be the entire right-hand side and the target is declared `TYPE i` in this file, so the assignment performs the identical conversion by itself.',
  },
  'lifecycle-is-initial': {
    category: 'lifecycle',
    summary: '`IS INITIAL` / `IS NOT INITIAL` on an `abap_bool`',
    detail: 'The three `check_on_*( )` methods return `abap_bool`, so the branch is the PREDICATIVE CALL — `IF client->check_on_init( ).` — which is how `z2ui5_if_client` documents it and how the whole sample corpus is written. Compounds keep the shape (`` ELSEIF client->check_on_event( `LOCK` ). ``, `IF client->check_on_navigated( ) AND mv_ready = abap_true.`). `IS NOT INITIAL` asks a boolean whether it is EMPTY, which is what that question means for a string, and it is one more dialect every later reader of the class has to hold. Only a NEGATIVE branch is spelled out, as `= abap_false`: there is no negated predicative form. The same rule covers every other `abap_bool`, in a `WHERE` clause as much as in an `IF`. A hint, deliberately — `abap_false` IS the initial value of a `char(1)`, so the two spellings agree and nothing here is broken; it is the one dialect question in the app guide a finding can settle mechanically. A structure component is never judged: in `row-flag IS INITIAL` the component may be any type, and the class\'s own `flag` attribute is not evidence about it.',
    example: 'IF client->check_on_init( ).        \" not: IF client->check_on_init( ) IS NOT INITIAL.\nIF mv_ready = abap_false.           \" not: IF mv_ready IS INITIAL.',
    fixNote: 'On a lifecycle call, `IS NOT INITIAL` becomes the predicative call (the tail is deleted) and `IS INITIAL` becomes `= abap_false` — the framework\'s checks return only `abap_true`/`abap_false`, so both rewrites are exact. On a plain `abap_bool` variable only `IS INITIAL` is rewritten (to `= abap_false`, its exact meaning for a char(1)); the NOT form is reported without a fix, because a variable can technically hold any character and choosing between `= abap_true` and `<> abap_false` would be a guess.',
  },
  'private-app-attribute': {
    category: 'lifecycle',
    summary: 'a `PRIVATE` instance attribute on a `z2ui5_if_app` class',
    detail: 'The app\'s state is persisted with `CALL TRANSFORMATION id`, and the transpiled runtime re-implements that walk with a dynamic `ASSIGN obj->(name)`, which reaches a PROTECTED attribute and **not** a private one. `sy-subrc` comes back 4, the serializer asserts, and every roundtrip answers `ASSERTION_FAILED` out of `lcl_heap.add_object` — with nothing in the message naming the attribute that caused it, which is what makes it expensive to find rather than merely wrong. A warning rather than an error, deliberately: a real SAP kernel serializes a private attribute fine, so the class works on the system it was written for and breaks on the transpiled runtime — abap2UI5\'s own Node backend and every e2e smoke. Six ports carried it while the 53 with a PROTECTED attribute were fine, which is what isolated it. App state belongs in PUBLIC — that is also what makes it reach the model at all — and helpers in PROTECTED. `CLASS-DATA` is never reported: a static attribute is not instance state and is not serialized with the app.',
    example: 'PRIVATE SECTION.\n  DATA t_all TYPE ty_t_row.   " → PUBLIC (state) or PROTECTED (helper)',
  },
  'validating-setter-out-of-range': {
    category: 'data',
    summary: 'a property whose setter refuses low values, bound to a field that arrives as `0`',
    detail: 'The declared type is not the whole domain. UI5 lets a control write its own `setXxx`, and a few of them refuse a value the type allows — `sap.ui.unified.RecurringCalendarAppointment` declares `recurrencePattern` as `int` and throws for anything below 1. An unfilled ABAP `TYPE i` serializes as exactly that `0`, and `ManagedObject.updateProperty` rethrows anything that is not a `FormatException`, so the WHOLE render dies rather than this one property being dropped. Reported by a user on UI5 1.150. What keeps the rule quiet is that the snapshot carries the setter\'s LOWER BOUND rather than the bare fact that it throws: 23 properties throw somewhere in their setter, and for most of them the initial `0` is perfectly legal (`MonthPicker.month` 0 is January, `TimesRow.intervalMinutes` guards `>= 720`). Only a guard of the shape `if (v < N) throw` is harvested — exactly what makes an unfilled ABAP field illegal — which is two properties in the whole snapshot. A field the seed fills with an accepted number is never reported, and an opaque row resolves to nothing at all.',
    example: 'DATA t_appointments TYPE STANDARD TABLE OF ty_appointment.   \" recurrence_pattern unseeded -> 0\n\" seed it: ( recurrence_pattern = 1 … )',
  },
  'absent-boolean-overrides-default': {
    category: 'data',
    summary: 'a row that omits a boolean the neighbouring rows set, where the property defaults to `true`',
    detail: '`abap_bool` has no absent state, so a field a row leaves out still ships as a real JSON `false` — correct almost everywhere, and wrong exactly where the UI5 property\'s own default is `true`: the row then renders the OPPOSITE of what it means, with nothing failing anywhere. On its own that would report every boolean seed there is, so the rule asks for both signals: the property defaults to `true` AND the seed is INCONSISTENT, meaning some rows of this very table set the field and others do not. A table that never sets it is ordinary data (`unread` and `active` are false for every row on purpose); a table that always sets it has nothing missing. The gap between two rows of one literal is what is almost never deliberate — one port\'s notification items lost both close buttons that way, and with them its only backend wire. A field named in `omit_initial_paths`, carried as a constructor-level default, or filled by a later LOOP is never reported.',
    example: 'VALUE #( ( title = `a` showClose = abap_true )\n         ( title = `b` ) )   \" showClose defaults to true and is now false',
  },
  'abap-date-formatter-mismatch': {
    category: 'bindings',
    summary: 'an ABAP `TYPE d`/`TYPE t` field converted with `Formatter.DateCreateObject`',
    detail: 'The curated module ships three date helpers, and which one a field needs is decided by what its ABAP type SERIALIZES as. `DateCreateObject` is `new Date( s )` and wants a string the JS Date constructor parses — an ISO one. A `TYPE d` reaches the model as `20240101` and a `TYPE t` as `120000`, and the constructor parses neither: both come back as an **Invalid Date**. `DateAbapDateToDateObject` and `DateAbapDateTimeToDateObject` exist for exactly this and split the digits themselves. What makes it worth a rule is where it surfaces: an Invalid Date is TRUTHY, so every guard that merely checks for presence accepts it, and the throw happens much later and somewhere else — `sap.ui.unified` `Month._checkDateEnabled` calls `CalendarDate.fromLocalJSDate`, which throws for every rendered day and takes the whole view down, with nothing in the stack naming the binding. The EMPTY-value case this rule does not cover is closed upstream: `DateCreateObject` returns `null` for a falsy input and `isNoAbapDate` rejects anything that is not eight digits, so reporting it would now be a finding on correct code. The type mismatch is the half no guard in the formatter can see, because it is handed a string and cannot know which ABAP type produced it.',
    example: "DATA valid_from TYPE d.\n\" …\na( n = `dateValue` v = `{ path: 'VALID_FROM', formatter: 'Formatter.DateCreateObject' }` )",
  },
  'redundant-init-display': {
    category: 'lifecycle',
    summary: 'a lifecycle fork whose two arms do the same thing',
    detail: '`check_on_init( )` is "this app INSTANCE never ran", and it **implies** `check_on_navigated( )`: every path to an instance\'s first `main( )` raises the navigated flag too — `factory_first_start` for a fresh start and for a draft restore, `factory_system_startup`, and `prepare_app_stack` for both legs of a `nav_app_call`. The interface states it. So `IF check_on_init( ) OR check_on_navigated( )` can never change its verdict on the OR, and an init branch whose only statement is the same display call its `ELSEIF check_on_navigated( )` twin makes is four lines saying what the ELSEIF says alone. The fork is only reported where BOTH arms are one identical display call — where the navigated arm does anything else (an `on_navigation( )`, an app return handled first) the fork really does decide something and the init arm stays.',
    example: 'IF client->check_on_init( ) OR client->check_on_navigated( ).   " the OR decides nothing\n  client->view_display( view->stringify( ) ).\nENDIF.',
  },
  'duplicate-for-iterator': {
    category: 'lifecycle',
    summary: 'the same `FOR` iterator name twice in one method',
    detail: 'Fine on ABAP 7.50+, where the iterator is local to its `VALUE #( )` expression — but a 7.02 downport (abaplint `--fix`, and the transpiler behind a Node-based runtime) materializes each one as `DATA <name> TYPE i` in the method body, and the second declaration fails activation with "variable already defined". Use distinct names (`i`, `j`, `k`) per `VALUE` block.',
    example: `DATA(a) = VALUE ty_t( FOR i = 1 WHILE i <= 3 ( i ) ).
DATA(b) = VALUE ty_t( FOR i = 1 WHILE i <= 3 ( i ) ).   " downported: i declared twice`,
  },
  'binding-to-reference': {
    category: 'bindings',
    summary: 'a `TYPE REF TO` attribute bound without dereferencing',
    detail: 'The model serializer walks DATA, not references — `client->_bind( )` on an attribute declared `TYPE REF TO …` throws at runtime. Bind the dereferenced data (`client->_bind( ref->* )`) or a plain data attribute. Both sample fixes that established this pattern were found by users hitting the exception in a running system.',
    example: 'DATA mt_data TYPE REF TO data.\n" …\n)->a( n = `items` v = client->_bind( mt_data )      " throws\n)->a( n = `items` v = client->_bind( mt_data->* )   " binds the table',
  },
  'manual-init-flag': {
    category: 'lifecycle',
    summary: 'a hand-rolled init flag instead of `client->check_on_init( )`',
    detail: 'The framework already knows whether this is the first run of the app instance — `client->check_on_init( )` is the lifecycle contract. A boolean attribute that gates the first render duplicates that knowledge as serialized state: it ships to the browser on every roundtrip for nothing, and subtle ordering bugs grow around the moment it flips. One mass migration replaced this pattern in 111 sample classes at once. Only the unambiguous shape is reported: an `IF` on the attribute being initial/false whose branch both sets it true and hands a view over — a lazy-load guard that displays nothing is left alone.',
    example: 'IF check_initialized = abap_false.   " reported\n  check_initialized = abap_true.\n  client->view_display( render( ) ).\nENDIF.\n" instead:\nIF client->check_on_init( ).\n  client->view_display( render( ) ).\nENDIF.',
  },
  'event-on-disabled-control': {
    category: 'frontend-wires',
    summary: 'an event handler on a control hard-disabled with a literal',
    detail: 'A bound `enabled` can flip at runtime, but a literal `enabled="false"` never does — the control can never fire, so the handler wired next to it is dead code that reads like a live wire. A hint, because a 1:1 port of a sample demonstrating the disabled *state* legitimately carries the original\'s handler. Bind `enabled` if it should ever flip.',
    example: ')->tag( `Button`\n    )->a( n = `press`   v = client->_event( `SAVE` )\n    )->a( n = `enabled` v = `false`   " SAVE can never fire',
  },
  'live-event-roundtrip': {
    category: 'frontend-wires',
    summary: 'a `liveChange` wire that round-trips per keystroke',
    detail: 'abap2UI5 serializes round-trips: an event fired while one is in flight is **dropped**, not queued. A `liveChange` wired to `client->_event( )` therefore sees the value of the last *completed* trip and skips the ones typed in between — the bound field lags under fast input and converges only when typing pauses. Prefer a two-way binding (the model updates without any event) or the control\'s final-value event (`change`/`search`/`submit`); keep the live wire only when every intermediate value genuinely must reach ABAP. `_event_client` and `follow_up_action` are frontend-only and are not judged.',
    example: ')->a( n = `liveChange` v = client->_event( `SEARCH` )   " lossy under fast typing\n" instead: bind two-way and react to the final-value event\n)->a( n = `value`  v = client->_bind( search_term )\n)->a( n = `change` v = client->_event( `SEARCH` )',
  },
  'event-without-handler': {
    category: 'frontend-wires',
    summary: 'an event nothing reacts to',
    detail: 'Usually a dead control — but in abap2UI5 an event also forces a roundtrip, and that alone synchronises the model back into ABAP. So this is a hint, never an error, and it is skipped entirely when handler names are not literals.',
    example: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`SAVE\` ) )   " and no SAVE in on_event`,
  },
  'trailing-empty-event-arg': {
    category: 'frontend-wires',
    summary: 'the last `t_arg` entry is empty and never arrives',
    detail: '`get_t_arg` buffers an empty argument and flushes it only when a later non-empty one follows, so an empty entry between filled ones keeps its slot and a TRAILING one disappears. The handler\'s `get_event_arg( n )` for that position reads initial, with no error anywhere. The framework pads a missing trailing argument only for a nullable declared kind on a control method, which does not apply to a backend `_event`.',
    example: `client->_event( val = \`PICK\` t_arg = VALUE #( ( \`\${/ID}\` ) ( \`\` ) ) )   " get_event_arg( 2 ) reads initial`,
    fixNote: 'The trailing empty `( \\`\\` )` row is deleted from the `VALUE #( )` constructor — it never arrives, so removing it changes nothing the handler can observe. A row with its line to itself takes the whole line; an inline row also takes the spaces in front of it. A comment is never removed with it.',
  },
  'json-literal-in-attribute': {
    category: 'bindings',
    summary: 'a raw JSON literal written into a view attribute',
    detail: 'UI5 parses an attribute value starting with `{` as a binding, so a JSON object literal (`{"sap.card":…`) is read as a binding path and the attribute ends up empty — the classic way to lose an integration Card\'s manifest. Keep the JSON in the model and bind it: `client->_bind( manifest )`.',
    example: `view->tag( n = \`Card\` ns = \`card\` )->a( n = \`manifest\` v = \`{"sap.card":{"type":"List"}}\` )`,
  },
  'event-arg-unresolved': {
    category: 'frontend-wires',
    summary: 'a bare-brace `t_arg` literal (`` `{COL}` ``)',
    detail: 'The runtime sends it verbatim, but only `$`-prefixed expressions are resolved by UI5 — so `get_event_arg( )` receives an **empty** value, with no error anywhere. Write `` `${COL}` ``. A template that starts with a `{0}` placeholder is fine: that form is quoted.',
    example: `client->_event( val = \`PICK\` t_arg = VALUE #( ( \`{/ID}\` ) ) )    " arrives empty
client->_event( val = \`PICK\` t_arg = VALUE #( ( \`\${/ID}\` ) ) )   " resolved`,
    fixNote: 'The missing `$` is inserted in the literal form; a `|…|` template is left alone.',
  },

  /* ── data and usability ─────────────────────────────────────────────── */
  'frontend-action-unknown-id': {
    category: 'frontend-wires',
    summary: 'an id-addressed wire naming an id no view declares',
    detail: 'The frontend resolves the first `t_arg` as a control id. When no view of the class gives a control that id — a typo, a renamed control, an id that only ever existed in another app — the lookup fails and the wire does **nothing**: no exception, no failed render, a button that looks connected. `CONTROL_BY_ID` at least logs the miss; `SET_FOCUS`, `SCROLL_TO`, `SCROLL_INTO_VIEW` and `KEYBOARD_SET_MODE` `return` without even a console line. Judged only when every `id` attribute of the class is a literal; a class that builds ids at runtime is left alone.',
    example: 'a( n = `id` v = `messageView` )\n\" … follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `messageview` ) ( `navigateBack` ) ) )',
  },
  'unknown-frontend-action': {
    category: 'frontend-wires',
    summary: 'a literal action name outside the frontend dispatch table',
    detail: 'A `client->_event_client( )` / `client->follow_up_action( )` naming its action as a string literal is dispatched exactly like the `cs_event-` constant — but the constant is compile-checked and the literal is not, and `FrontendAction.execute` looks the name up in its handler table and does **nothing at all** on a miss: no exception, not even a console line. Case matters — the runtime never upper-cases, so `set_title` misses where `SET_TITLE` works. Anything not name-shaped is `follow_up_action`\'s raw-JavaScript escape hatch and is not judged.',
    example: 'client->follow_up_action( val = `SET_TITEL` t_arg = VALUE #( ( `Hi` ) ) ).   " swallowed silently\n" instead:\nclient->follow_up_action( val = client->cs_event-set_title t_arg = VALUE #( ( `Hi` ) ) ).',
  },
  'unknown-view-slot': {
    category: 'frontend-wires',
    summary: 'a literal view slot outside MAIN / NEST / NEST2 / POPUP / POPOVER',
    detail: 'The `view` parameter (and `SET_SIZE_LIMIT`\'s view key) names one of the five slots, case-sensitively: the server compares it as an ABAP string and the browser uses it as an object key. The natural guesses all miss — `main` (lower case), and `NESTED` for `cs_view-nested`, whose VALUE is `NEST`. For `CONTROL_BY_ID` a wrong slot is worse than none: a named slot **suppresses the global id fallback**, so the wire dies although the id exists in an open view.',
    example: 'client->_event_client( val = client->cs_event-control_by_id\n                       view = `NESTED`   " cs_view-nested is NEST\n                       t_arg = VALUE #( ( `table1` ) ( `focus` ) ) ).',
  },
  'literal-view-slot': {
    category: 'frontend-wires',
    summary: 'a view slot retyped as a string where `cs_view` has a constant for it',
    detail: 'The mirror image of `unknown-view-slot`, and the reason that rule keeps finding work to do. `view = \`MAIN\`` is correct — and nothing checks it: the value travels to the browser as an object key, so a rename, a typo or the wrong half of the pairing dispatches to no view at all, silently. `client->cs_view-main` cannot fail that way, because the ABAP compiler resolves the name: `cs_view-mian` does not activate. It also spells the one pairing nobody remembers — the constant is `cs_view-nested` and its VALUE is `NEST`, `cs_view-nested2` is `NEST2` — which is exactly the mistake `unknown-view-slot` reports once the literal is written out. A hint, because the wire works today; `--fix` writes the constant in place.',
    example: 'client->_event_client( val = client->cs_event-control_by_id\n                       view = `NEST`                    " works, but nothing checks it\n                       t_arg = VALUE #( ( `table1` ) ( `focus` ) ) ).\n\" instead:\nclient->_event_client( val = client->cs_event-control_by_id\n                       view = client->cs_view-nested\n                       t_arg = VALUE #( ( `table1` ) ( `focus` ) ) ).',
    fixNote: 'replaces the literal with the `client->cs_view-…` constant carrying that value — an exact one-token substitution, nothing to guess.',
  },
  'invalid-keyboard-shortcut': {
    category: 'frontend-wires',
    summary: 'a shortcut combo that names no key',
    detail: 'The registration normalizes the combo (`Ctrl+Shift+S` → `ctrl+shift+s`, aliases like `cmd`/`return` included) and refuses one that consists of modifiers only — logged once, never registered, and every later keydown simply does nothing. The scope argument is judged separately: a slot key or a declared control id (via `frontend-action-unknown-id`).',
    example: 't_arg = VALUE #( ( `Ctrl+Shift` ) ( `SAVE` ) )   " modifiers only — binds nothing\nt_arg = VALUE #( ( `Ctrl+Shift+S` ) ( `SAVE` ) )',
  },
  'invalid-action-payload': {
    category: 'frontend-wires',
    summary: 'a JSON action payload the runtime silently downgrades',
    detail: 'The `object`-kind control methods (`setSticky`, `setHiddenInPopin`, `setP13nData`) run their argument through `castArg`, whose catch turns a literal that does not parse as JSON into `{}` — a `setSticky` with a typo\'d payload then *un-sticks* everything instead of failing. For the enum-array payloads the values are judged too: an unknown `sap.m.Sticky` / `sap.ui.core.Priority` key is dropped by UI5 with the same silence. `BINDING_CALL`\'s compound filter-groups JSON is judged the same way, including each row\'s operator.',
    example: 't_arg = VALUE #( ( `table1` ) ( `setSticky` ) ( `ColumnHeaders` ) )      " not JSON -> {}\nt_arg = VALUE #( ( `table1` ) ( `setSticky` ) ( `["ColumnHeaders"]` ) )',
  },
  'relative-aggregation-without-context': {
    category: 'bindings',
    summary: 'a root-level aggregation bound with a relative path — it resolves against nothing and renders empty',
    detail: 'Inside a bound row template a relative aggregation path is the normal and correct form. Outside one there is no context: `Model.resolve` returns `undefined` for a relative path with none (legacy syntax is off since 1.88), `bindList` never resolves, and the aggregation stays **empty** with no error anywhere. The complex form hides it well — `{path: \'T_ITEMS\'}` looks deliberate, and the missing leading slash is the whole defect. It falls between two existing rules: `hardcoded-binding-path` only matches paths that START with `/`, and `relative-binding-without-context` deliberately skips aggregations. Reported only where the control has neither a binding context nor an enclosing template, which is what separates the broken cases from the dominant correct ones. Three narrowings came from running it on a 637-file corpus, where it first fired 81 times: the binding\'s OWN path only (a nested `sorter: { path: … }` is not it), a named model stripped before asking whether the path is absolute (`message>/` IS absolute), and an aggregation whose value the reconstructor could not resolve — a `_bind( )` handed in as a method parameter — still makes its children a row template, because a blind spot is not a defect. A fourth came from the `abap2UI5/samples` corpus after release: a class that issues `cs_event-bind_element` sets a binding **context on a whole view slot at runtime**, so every relative path under it resolves against a row the document never names — which is the entire point of that idiom, and invisible to a static walk. Which slot was bound is a second question, and a wrong second guess is worse than silence.',
    example: ')->a( n = `items` v = `{path: \'T_LEGEND\'}` )                                    " empty\n)->a( n = `items` v = |\\{ path: \'{ client->_bind( val = t_legend path = abap_true ) }\' \\}| )',
  },
  'enum-field-unset-on-insert': {
    category: 'bindings',
    summary: 'a row built at runtime without a field the view binds to an enum — the empty string takes the view down',
    detail: 'The demo-kit originals push a JS object with the key **absent**, and UI5 falls back to the property default. ABAP has no absent: an unset field ships as `""`, which is not a member of any enum, so `ManagedObject.validateProperty` throws — and `ManagedObjectBindingSupport` re-throws anything that is not a `FormatException`, so the binding update dies and takes the view with it. Both repairs are already in the framework: seed the default (`type = \'None\'`), or name the field in `omit_initial_paths`. Three construction sites are judged, because a port picks between them for reasons that have nothing to do with this defect: an `INSERT`/`APPEND` of a `VALUE #( … )` literal, the `t = VALUE #( ( … ) ( … ) )` seed a `model_init` writes (including the nested `elements = VALUE #( … )` inside one), and a row assembled in a work area and inserted a few statements later. A row copied wholesale — `VALUE #( FOR row IN t_all … ( row ) )` — has no field list to read and is not judged. Fields are keyed on the table each **bound aggregation** names, absolute (`{/T_PAGES}`) and relative (`{path: \'T_APPOINTMENTS\'}`) alike, and each key gets only the fields of its OWN row template: a PlanningCalendar binds `rows`, `specialDates` and a nested `appointments` at once, and only the innermost carries `ariaHasPopup`. Not reported where the class fills the field afterwards — a `LOOP … r->state = …` completing a seed is how half this corpus moves an original\'s frontend formatter server-side — nor for a mixed-case path, which is not an ABAP component name at all (`type="{Text}"` is the demo kit\'s own quirk, ported verbatim: it resolves to nothing, so UI5 keeps the default). The widening came from a corpus sweep in 2026-08, where the `INSERT`-only reading had missed ten real defects across seven ports, every one of which took its view down.',
    example: 'INSERT VALUE #( title = `New` start_at = s ) INTO TABLE t.        " type unset -> "" -> throws\nINSERT VALUE #( title = `New` type = `None` start_at = s ) INTO TABLE t.\nt = VALUE #( ( title = `A` type = `Type01` ) ( title = `B` ) ).             " the seed is a build site too',
  },
  'event-arg-js-callback': {
    category: 'frontend-wires',
    summary: 'a JS callback in a `t_arg` — the whole event handler fails to parse',
    detail: 'A `$`- or `{`-opening argument is sent to the frontend verbatim and resolved by UI5, which parses the **entire** handler string with `BindingParser.parseExpression`. `ExpressionParser` has no `function` keyword — its token table knows only `false`/`null`/`true`/`in`/`typeof` — and `{` is the object-literal `nud`, so `.map(function (o) { … })` throws before any argument is read. This is not a wrong argument value: the exception is on the handler, so every argument is lost and the event never reaches the backend. An arrow function fails identically (`=>` is not a token). An argument that does not open with `$` or `{` is shipped as a JS string literal, so the word "function" inside a toast template is not reported.',
    example: 't_arg = VALUE #( ( `$event.oSource.getSelectedRows().map(function(r){return r.getId();})` ) )   " dead\n\" bind the state instead - PlanningCalendarRow.selected and CalendarAppointment.selected are bindable',
  },
  'filter-groups-not-arrays': {
    category: 'frontend-wires',
    summary: 'a `BINDING_CALL` filter payload whose groups are objects — it clears the binding instead of filtering it',
    detail: 'The compound filter form is an array of GROUPS, each an array of `[path, operator, value1, value2?]` ROWS. `buildFilterGroups` keeps only elements that pass `Array.isArray`, so an array of OBJECTS — `[{"path":…,"operator":…,"value1":…}]` — is dropped whole, the group list empties, and control falls into `binding.filter([])`: the filter is **cleared**, never applied. Nothing is logged on that path, because the root *is* an array so the malformed-JSON guard passes and the per-group drop is silent by construction. An intentional clear is `[]`, which is empty to begin with and is not reported.',
    example: 't_arg = VALUE #( ( `d` ) ( `items` ) ( `filter` ) ( `[{"path":"NAME","operator":"Contains","value1":"x"}]` ) )   " cleared\nt_arg = VALUE #( ( `d` ) ( `items` ) ( `filter` ) ( `NAME` ) ( `Contains` ) ( term ) )                            " positional',
  },
  'popover-anchor-unknown-id': {
    category: 'frontend-wires',
    summary: '`popover_display( by_id = … )` anchored to an id no view declares',
    detail: 'A popover opens **by** a control — `by_id` names its anchor. With a literal id no view of the class declares, the fragment loads, `displayPopover` finds no `openBy` control, logs it and **destroys the fragment again**: nothing opens, nothing renders red, and the property gate saw a perfectly valid fragment. Judged under the same trust condition as `frontend-action-unknown-id` — only when every `id` attribute of the class is a literal.',
    example: ')->a( n = `id` v = `btnInfo` )\n\" …\nclient->popover_display( xml = popover->stringify( ) by_id = `btninfo` ).',
  },
  'get-viewname-removed': {
    category: 'lifecycle',
    summary: '`client->get( )-viewname` — removed from `ty_s_get`',
    detail: 'The `VIEWNAME` component was removed from `z2ui5_if_types=>ty_s_get` (it always carried an empty string), so the read **no longer compiles** — but nothing in a systemless pipeline says so before activation: abaplint has no signature knowledge of the framework interfaces, and the render gate never sees the class fail. The same blindness `popover-display-val` covers.',
    example: 'DATA(viewname) = client->get( )-viewname.   \" no longer compiles',
  },
  'raw-javascript-to-frontend': {
    category: 'frontend-wires',
    summary: 'raw JavaScript shipped to the browser — via `follow_up_action` or the view',
    detail: 'abap2UI5\'s frontend is a **renderer**: behaviour travels as data (bindings, `cs_event-` actions), never as code. Three shapes break that line, and all three run unchecked in the browser, invisible to every gate and to anyone reading the ABAP: a non-name `val` in `follow_up_action( )` (the raw-JS escape hatch — inserted verbatim as `custom_js`), a hand-written handler string on an event attribute (UI5 evaluates it as JavaScript), and a `<script>` tag inside an attribute value (the `core:HTML` route). Use a `cs_event-` frontend action, a `client->_event*( )` wire or backend logic instead. A repo that deliberately allows the escape hatch can lower or disable the rule in its `abap2ui5lint.jsonc`.',
    example: 'client->follow_up_action( val = `sap.ui.getCore().byId(\'x\').focus()` ).   " raw JS\n)->a( n = `press` v = `z2ui5.oView.doSomething()` )                        " handler string\n" instead:\nclient->follow_up_action( val = client->cs_event-set_focus t_arg = VALUE #( ( `x` ) ) ).',
  },
  'json-bind-on-scalar-property': {
    category: 'bindings',
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
  'picker-value-without-format': {
    category: 'data',
    summary: 'a date/time picker binding `value` with neither a binding type nor a `valueFormat`',
    detail: 'A picker parses and formats its `value` with `valueFormat`, and when neither that nor a binding **type** says otherwise it falls back to the browser LOCALE for the string it writes BACK. `client->_bind( )` is two-way and the write-back is a bare ABAP assignment, so the locale string lands in the field. Measured on OpenUI5 (en-US, seeded `"2018-07-09T09:00:00"`): a `sap.m.DateTimePicker` still READS the ISO string — `DateFormat` falls back to ISO — but writes back `"Jul 12, 2018, 2:30:00 PM"`; a `sap.m.DatePicker` does not read it at all (`dateValue` stays null, the raw text is shown) and writes back `"7/12/18"`. Nothing raises, and en-US hides most of it — in de-DE the field comes back as `"04.03.2025, 10:15:00"`, which `new Date( )` parses month-first, so an appointment picked for 4 March is drawn on 3 April. Declare `valueFormat` with the pattern the ABAP field carries (`yyyy-MM-dd\'T\'HH:mm:ss`), or bind with a `sap.ui.model.type.Date`/`DateTime` and its `formatOptions.source` — a typed binding owns the pattern and is never reported. The picker family is read off the metadata (a control declaring both `value` and `valueFormat`), and the rule needs the ABAP class: it only fires where the CLASS also writes the field, because a field only the picker ever writes is self-consistent whatever the locale does, and one the class writes as digit-free text (`N/A`) is not a date at all.',
    example: 'a( n = `valueFormat` v = `yyyy-MM-dd\'T\'HH:mm:ss` )\na( n = `value`       v = client->_bind( start_at ) )',
  },
  'date-type-without-source': {
    category: 'data',
    summary: '`sap.ui.model.type.Date` / `DateTime` / `Time` without `formatOptions.source`',
    detail: 'Without a `source` format option these types expect a **JS `Date` instance** in the model. An abap2UI5 model is JSON serialized from ABAP, so the value is always a string (or a timestamp number) and a `Date` can never reach it — the type raises a `FormatException` on the first `format()` and the field stays empty, with nothing in the console for a `Text`. Add the source format the ABAP field actually carries, e.g. `formatOptions: { source: { pattern: \'yyyy-MM-dd\' } }`. Note the alias form is resolved through the view\'s `core:require`, so `type: \'DateType\'` is judged like the full module name.',
    example: "a( n = `text` v = |\\{ path: '{ client->_bind( val = date path = abap_true ) }', type: 'DateType', formatOptions: \\{ style: 'short' \\} \\}| )",
  },
  'denied-control-method': {
    category: 'frontend-wires',
    summary: 'a `CONTROL_BY_ID` wire naming a method the frontend denylist refuses',
    detail: 'The wire\'s ALLOWED side is open by design — any public control method runs, so ordinary setters and toggles need no whitelist entry. The DENIED side is a closed set, and it is silent in the same way a wrong id is: `FrontendAction` logs "method not allowed" and returns, so the ABAP compiles, the view renders and the button does nothing. Denied are the methods that would break the framework\'s own invariants — teardown and reparenting (`destroy`, `exit`, `setParent`, `addDependent`, `placeAt`), model and binding swaps (`setModel`, `setBinding*`, `bind*`/`unbind*`), event-handler tampering (`attach*`/`detach*`, `fireEvent`), the render lifecycle (`rerender`, `invalidate`) and the GENERIC reflection mutators that take the member name as an argument (`addAggregation`, `removeAllAggregation`, `setAssociation`, …). The NAMED per-aggregation methods are allowed and are never reported: `removeAllItems` and `destroyContent` touch only children the control itself owns, exactly like the long-allowed `removeItem`.',
    example: 'follow_up_action( val = client->cs_event-control_by_id\n                  t_arg = VALUE #( ( `list` ) ( `destroy` ) ) )',
  },
  'frontend-action-too-new': {
    category: 'version',
    summary: 'a `CONTROL_GLOBAL` target the target release does not carry yet',
    detail: 'Four of the global targets are resolved with a LAZY `sap.ui.require`, and deliberately so: a hard dependency on a module the running release does not have 404s and takes the whole component down with it. What that buys in robustness it pays for in silence — below its release the require returns `undefined`, the dispatch hits its "not available" guard, and the wire does nothing at all. `THEMING.setTheme` needs 1.118, `FORMATTING.setCustomCurrencies`/`addCustomCurrencies` 1.120, `INVISIBLE_MESSAGE.announce` 1.78, and `POPUP.setWithinArea` 1.89 (there the module is old and only the method is new). This is the version half of the wire family: `member-too-new` and its siblings judge what the VIEW writes, and nothing judged what the class SENDS.',
    example: 'follow_up_action( val   = client->cs_event-control_global\n                  t_arg = VALUE #( ( `THEMING` ) ( `setTheme` ) ( `sap_horizon` ) ) )',
  },
  'control-call-arg-count': {
    category: 'frontend-wires',
    summary: 'more `t_arg` values than the control method declares',
    detail: 'The frontend declares the argument kinds of every control method it knows, and `castArgs` ends on `kinds.slice(0, count)` — so an argument past the declared ones is never passed to the control. It is not an error anywhere: the call runs, with fewer arguments than the source appears to give it, and the extra value reads as intent to every later reader. `back`, `close`, `focus`, `collapseAll` and the other no-argument methods are the common case; `setExpanded` given two is the other. A method the frontend does NOT declare is open by design (any public, non-denylisted one) and is never judged on arity.',
    example: 'follow_up_action( val   = client->cs_event-control_by_id\n                  t_arg = VALUE #( ( `nav` ) ( `back` ) ( `page2` ) ) )   " back takes none "',
  },
  'control-call-arg-kind': {
    category: 'frontend-wires',
    summary: 'a `t_arg` value that is not the kind the control method declares',
    detail: 'The declared kinds are not decoration — `castArg` acts on them. An `int` argument runs through `Number( )`, so a non-numeric literal arrives as `NaN` and every comparison against it is false: `sap.m.Button`\'s badge setters compare the incoming value against the stored bound, so the value is dropped into an `else` whose only effect is a `Log.warning`. A `bool` argument is `raw === "true" || raw === "X"` and nothing else, so a literal meant as true in any other spelling — `1`, `TRUE`, `abap_true`, `Y` — silently arrives as FALSE and switches the flag the wrong way. The ABAP boolean tokens (`X`, a space, the empty string) and the literal `true`/`false` are the accepted spellings and are never reported.',
    example: 'follow_up_action( val   = client->cs_event-control_by_id\n                  t_arg = VALUE #( ( `wizard` ) ( `setExpanded` ) ( `abap_true` ) ) )',
  },
  'invalid-aggregation-item': {
    category: 'frontend-wires',
    summary: 'a slashed control id that addresses no aggregation item',
    detail: 'A cloned aggregation item has no id the backend can know — the rendered one carries the view prefix the framework assigns at runtime — so it is addressed positionally as `<id>/<aggregation>/<index>` (0-based) and resolved in the browser. Two ways to get that wrong, and the id rules around this one see neither, because they judge the head segment alone: a slashed value that does not MATCH the shape (a non-numeric index, a fourth segment) never enters the aggregation path at all and is looked up as one plain id, which resolves to nothing; and a shape that matches but names an aggregation the control does not declare makes `getAggregation` return nothing, so the wire is dropped with a log. The aggregation half is judged only when the head id resolves to a control the snapshot knows.',
    example: 'follow_up_action( val   = client->cs_event-control_by_id\n                  t_arg = VALUE #( ( `carousel/pages/first` ) ( `setActivePage` ) ) )',
  },
  'binding-on-association': {
    category: 'bindings',
    summary: 'a binding written into an association attribute',
    detail: 'Only properties and aggregations can be data-bound. `XMLTemplateProcessor` handles an association attribute by taking its value **verbatim as a control ID** (`createId(sValue)`, or a comma/space split for a 0..n association) — `BindingInfo.parse` is never called on it. So the braces travel into an id nothing answers to, the association stays empty, and neither the parser, the render gate nor the console says a word. Drive an association imperatively instead, with a `CONTROL_BY_ID` setter — which is also why `settable-property-via-action` deliberately never pushes an association towards a binding.',
    example: 'a( n = `selectedSection` v = client->_bind( section ) )   " association -> id "{/SECTION}"\n" follow_up_action( … t_arg = VALUE #( ( `opl` ) ( `setSelectedSection` ) ( section ) ) )',
  },
  'unknown-model': {
    category: 'bindings',
    summary: 'a `name>` binding against a model the app does not have',
    detail: 'abap2UI5 serves exactly **one** data model per view slot — the default one, serialized from the class\'s PUBLIC attributes — plus the framework\'s own `device>` and `message>` (and `http>` on a switched path). A prefix outside that set resolves to no model at all, and UI5 leaves the property unset without a word. It is the most common leftover of a ported demo-kit sample, whose original names its models freely (`{ui>/rowMode}`, `{i18n>KEY}`): the fix is to fold the field into the default model with `client->_bind( )`, not to add a model — and there is no i18n model by design, because translation is a backend concern. A model registered by a `SET_ODATA_MODEL` wire of the same class counts as available; a class that registers one under a non-literal name is not judged at all.',
    example: 'a( n = `text` v = `{i18n>title}` )\na( n = `text` v = client->_bind( title ) )',
  },
  'control-state-lost-on-rebuild': {
    category: 'frontend-wires',
    summary: 'a `CONTROL_BY_ID` `set…( )` that no binding can carry, issued only off the display path',
    detail: 'The exact inverse of `settable-property-via-action`, and its blind spot. That rule fires when the setter matches a **bindable property** and says "bind it instead"; it is silent for the three shapes where that answer does not exist — an **association** (`setNextStep`, `setSelectedSection`, `setActivePage`, `setCurrentStep`), a **function-typed property** (`sap.m.MessagePopover.asyncURLHandler`) and a method that is **no member at all** (`setBadgeMinValue`: `sap.m.Button` declares `badgeStyle` as its only badge property and keeps the bounds in private fields `Button.init` resets to 1/9999). Those three are live control state, and abap2UI5 does not patch a view — `view_display( )` hands new XML to the VIEW_SLOTS action, whose `displayMain` destroys the MAIN slot (taking POPUP and POPOVER with it) and builds a fresh tree with `XMLView.create`. Every control in it is a new object carrying what the XML declares and nothing else. A bound property survives that, because the binding re-applies; this state does not. So a class that sets it from an event handler and never re-issues it from the display path loses it on the next rebuild — a restored draft, a called app handing control back, any later `view_display( )` — while the ABAP field describing it survives as class state, and the app then contradicts itself. The remedy is to re-issue the call from the method that displays the view (samples-controls app 249 re-sends both badge bounds from the values it kept; app 534 ends `view_display( )` on the `path_apply( )` that wires the whole wizard path). Deliberately narrow: only a **non-literal** value is judged, because a constant carries no class state for the rebuilt view to contradict — `setCurrentStep( \'ProductInfoStep\' )` is a one-shot corrective jump and `setSelectedSection( \'\' )` a reset to null, and re-issuing either on every rebuild would be the defect. A wire is silent when its own method issues a display call, when any method on that path (a helper it calls, a few levels deep) issues the same id+setter, and — the same thing seen from the other side — when it is queued next to a `popup_display( )`/`popover_display( )`, since the system-action phase is awaited before the follow-up actions run.',
    example: 'METHOD on_event.\n  client->follow_up_action( val   = client->cs_event-control_by_id\n                            t_arg = VALUE #( ( \`step1\` ) ( \`setNextStep\` ) ( next ) ) ).\nENDMETHOD.\n" -> re-issue the same call from view_display( ), after client->view_display( )',
  },
  'settable-property-via-action': {
    category: 'frontend-wires',
    summary: 'a `CONTROL_BY_ID` `set…( )` where the control has a bindable property of that name',
    detail: 'The project rule is *prefer a bindable property over a frontend action*: a two-way bound property keeps the state in the model, where it survives a view rebuild, a draft restore and the browser Back button — a frontend action does not, and it also needs a round-trip to be re-applied. Only **properties** are reported: an association (`sap.uxap.ObjectPageLayout.selectedSection`) and an aggregation cannot be data-bound at all, so driving those imperatively is the only way and is never flagged. A hint, not an error — an imperative call can still be the right answer when the sample\'s point is the imperative API itself.',
    example: 'follow_up_action( val = client->cs_event-control_by_id\n                  t_arg = VALUE #( ( `sideContent` ) ( `setShowSideContent` ) ( `true` ) ) )\n\" -> a( n = `showSideContent` v = client->_bind( show_side ) )',
  },
  'relative-binding-without-context': {
    category: 'data',
    summary: 'a relative `{FIELD}` on a control that has no binding context',
    detail: 'A relative binding is resolved against the control\'s binding context. Inside a bound aggregation that context is the row; outside one there is none, and `JSONModel._getObject` returns `undefined` — the control renders **empty**, with no error anywhere. This is the flattened-element-binding trap: the original did `bindElement(\'/Coll/0\')`, the port seeded that record at the model root and kept the relative `{FIELD}`. Bind the root field instead (`client->_bind( field )`). **All four shapes a property binding takes are judged**, not only the bare `{NAME}` the rule started on: the composite `{STREET} {HOUSENUMBER}`, the complex `{ path: \'PRICE\', type: … }` and the expression `{= ${STATUS} ? … }` each resolve slashless paths against the same missing context and render just as blank. The composite is the shape that pays for the rest — samples-controls app 592 shipped 42 dead address bindings across 21 sections in it, over correctly declared root fields, past a green gate, because the matcher was anchored `^{NAME}$`. A name the model root does NOT have is reported too: the verdict never depended on the name (a slashless path with no context resolves against nothing whatever it says), only the confidence that there is no context does — so that arm additionally stays silent under a bound aggregation whose row shape could not be resolved. Four things ARE a context and none of them is reported: an enclosing bound aggregation, a per-row **template** aggregation (`template`, `rowActionTemplate`, `rowSettingsTemplate` — UI5 clones them per row and the context comes from the parent\'s own rows binding in a sibling aggregation), a `binding="{/PATH}"` attribute (a ManagedObject special setting handed to `bindObject( )` — the declarative form of the wire below), and a `cs_event-bind_element` wire, which is scoped to **the one view slot it names**: one popup wire used to disarm the check for every document of the class, main slot included.',
    example: 'a( n = `title` v = `{NAME}` )   \" NAME is a root field -> renders empty\na( n = `title` v = client->_bind( name ) )',
  },
  'collection-bound-to-property': {
    category: 'data',
    summary: 'a table or structure bound to a scalar property',
    detail: 'The property receives an object where it expects a value. Nothing throws; the control shows nothing useful.',
    example: `DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
…
view->ele( \`Table\` )->a( n = \`headerText\` v = client->_bind( t_rows ) )   " items, not headerText`,
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
    example: 'view->tag( `Image` )->a( n = `src` v = `logo.png` )->a( n = `decorative` v = `false` )   " no alt, no ariaLabelledBy',
  },
};
