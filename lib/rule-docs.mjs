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
 *   remedy    the SAME source, fixed — REQUIRED, gated the same way. It is the
 *             other half of `example` and the reason both exist as separate
 *             fields: the pair is a before/after a reader can diff by eye, and
 *             a report can deep-link straight at it. Several examples used to
 *             carry the fix as a trailing line of their own snippet, which
 *             made `example` no longer "the source that triggers it" — a
 *             reader could not tell which of the two lines was the defect.
 *             Keep the two in step: same control, same ids, same shape, so
 *             the only thing that differs between them is the defect.
 */
import { UNIT_RULES } from './rules/index.mjs';
import { docOf } from './rule.mjs';

export const CATEGORIES = [
  { id: 'metadata', title: 'Controls and members', blurb: 'Everything the view writes, resolved against the UI5 metadata snapshot generated from the OpenUI5 sources.' },
  { id: 'structure', title: 'View structure', blurb: 'Defects in the shape of the document itself — several of them make the view builder assert before a view is ever produced.' },
  { id: 'version', title: 'Version and deprecation', blurb: 'Portability against the UI5 version your system actually runs (--ui5, default 1.71) and the distribution it serves (--distribution).' },
  /* The abap2UI5 half was one flat group of 54 — more than half the rule set
   * behind a single heading, which on a searchable page is the same as no
   * heading at all. It is four now, split by what the rule reads: the class's
   * own lifecycle, the wires it sends the frontend, what a binding addresses,
   * and how the chain is written. Nothing about the rules changed. */
  /* The one group that is not about the UI5 frontend at all: what keeps an
   * app renderable by a NON-UI5 frontend (the protocol's portable profile). */
  { id: 'portable', title: 'Portability beyond UI5 (opt-in)', blurb: 'The abap2UI5 protocol\'s portable profile: the subset of the view vocabulary a non-UI5 frontend — UI5 Web Components, Adaptive Cards, an agent — renders. Off until a config asks for it; an app outside the profile still runs on UI5 exactly as written.' },
  { id: 'lifecycle', title: 'abap2UI5 — the app class', blurb: 'The lifecycle and the API surface of the class itself: whether the view is ever displayed, whether the roundtrip finds it again, and whether the objects it names are ones abap2UI5 released.' },
  { id: 'frontend-wires', title: 'abap2UI5 — frontend wires', blurb: 'Everything travelling to the browser as an event or an action. The frontend resolves these against closed sets and, on a miss, mostly returns without a log — so a wrong wire is the quietest defect in the framework.' },
  { id: 'bindings', title: 'abap2UI5 — bindings', blurb: 'What a binding actually addresses once the framework has derived the client path from the ABAP name: whether the field exists, whether it survives the roundtrip, and whether the value arrives as the type the property expects.' },
  { id: 'layout', title: 'abap2UI5 — chain layout', blurb: 'How the builder chain is WRITTEN. The XML it emits is one line by construction, so the ABAP indentation is the only picture of the view tree that exists. All hints; the view renders identically either way.' },
  { id: 'data', title: 'Data and usability', blurb: 'The view loads and renders — but not with the data, or not for the user, the author had in mind.' },
  /* What a source says back to the linter. A directive is the one statement
   * in a file nothing else checks — so the linter checks it. */
  { id: 'directives', title: 'Directives', blurb: 'The `abap2ui5lint-disable…` comments themselves: a suppression is a statement about the code, and one that names no rule or waives nothing is wrong in the same way a stale baseline entry is.' },
];

/** The published rule reference — one card per rule, generated from this file
 *  by `scripts/generate-rules-page.mjs`. */
export const RULES_PAGE = 'https://abap2ui5.github.io/linter/';

/** The card for one rule: what it means, how severe it is, how to waive it. */
export const ruleUrl = (id) => `${RULES_PAGE}#${id}`;

/** The before/after pair inside that card. A report links here rather than at
 *  the card, because the pair is the half a reader acts on. */
export const ruleExampleUrl = (id) => `${RULES_PAGE}#${id}-example`;

export const RULE_DOCS = {
  /* ── controls and members ───────────────────────────────────────────── */

  /* ── view structure ─────────────────────────────────────────────────── */
  'excess-shut': {
    category: 'structure',
    summary: 'one `shut( )` more than the builder tree is deep',
    detail: 'The builder ascends past the root — one `end( )` too many. The builder asserts on it (`parent IS BOUND`), so the app dumps before it renders. The rule id keeps the older spelling `shut`: renaming it would silently invalidate every baseline entry and rule override that names it.',
    example: `view->ele( n = \`View\` ns = \`mvc\`
    )->a( n = \`xmlns\` v = \`sap.m\`
    )->ele( \`Page\`
        )->tag( \`Button\`
    )->end(
)->end(
)->end( )   " one end( ) past the root`,
    remedy: `view->ele( n = \`View\` ns = \`mvc\`
    )->a( n = \`xmlns\` v = \`sap.m\`
    )->ele( \`Page\`
        )->tag( \`Button\`
    )->end(
)->end( )`,
    fixNote: 'The `->end( )` call the finding sits on is deleted; the paren before it, which closes the previous call, stays.',
  },
  'chain-unbalanced-parens': {
    category: 'structure',
    summary: 'a builder chain whose parentheses do not balance — one `)` too many, or one never closed',
    detail: 'A builder chain is one statement over many lines, and every call in it opens a parenthesis the next line closes — so the closing run at its end (`) ) ).`) is where one too many or one too few goes unnoticed. The class does not activate with it, which no systemless pipeline sees. Worse for this gate: the statement reader counts parentheses, a stray `)` leaves the count at minus one, the chain\'s own `.` stops being a statement end, and the chain is read together with the display call behind it — the class then reconstructs **no view at all**, and until this rule existed the run reported nothing and exited 0. A `(` never closed does the same in the other direction and swallows the rest of the file. The scan behind this rule recovers at the stray parenthesis, so the finding names the line that carries it; only statements with a builder call in them are judged.',
    example: `view->tag( \`Button\`
    )->a( n = \`text\` v = \`Go\` ) ).   " one ) too many`,
    remedy: `view->tag( \`Button\`
    )->a( n = \`text\` v = \`Go\` ).`,
  },
  'duplicate-property': {
    category: 'structure',
    summary: 'the same attribute written twice on one control',
    detail: 'The view builder asserts on a repeated attribute (`ASSERT NOT line_exists( t_pair[ n = n ] )`) rather than letting the second value win silently, so the class dumps when the view is built. Two different values are a conflict only the author can settle; the same call written twice — a copy left behind by a merge or an edit — is only the dump.',
    example: `view->tag( \`Button\` )->a( n = \`text\` v = \`A\` )->a( n = \`text\` v = \`B\` )`,
    remedy: `view->tag( \`Button\` )->a( n = \`text\` v = \`B\` )`,
    fixNote: 'Where the second write REPEATS the first — the same attribute call with the same argument text, blanks aside — the second call is deleted, from its `->` to its closing parenthesis; the first one already says everything it does. Two different values keep the finding: which one was meant is not the linter\'s to decide.',
  },
  'attribute-without-element': {
    category: 'structure',
    summary: '`a( )` on the bare factory root — nothing to attach it to',
    detail: 'An attribute call before any element was opened. There is no element to carry it, and the builder asserts.',
    example: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->a( n = \`title\` v = \`Hi\` )   " no element open yet`,
    remedy: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( \`Page\` )->a( n = \`title\` v = \`Hi\` )`,
  },
  'display-root-mismatch': {
    category: 'structure',
    summary: 'a `mvc:View` handed to `popup_display( )`, or a `core:FragmentDefinition` to `view_display( )`',
    detail: 'The slot decides how the client builds the document: `view_display( )` and the nested variants go through `XMLView.create`, `popup_display( )` and `popover_display( )` through `Fragment.load`. A fragment is not a view, and a view has no `open( )` — so the wrong pairing fails in the browser. Only reported where the document root and the consuming call are in the same statement; a bare control root is a legitimate fragment and is never reported.',
    example: `DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\` ).
client->popup_display( popup->stringify( ) ).   " a popup slot wants a Dialog root`,
    remedy: `DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( )->ele( \`Dialog\` ).
client->popup_display( popup->stringify( ) ).`,
  },
  'render-error': {
    category: 'structure',
    summary: 'the reconstructed view did not survive a real UI5 render',
    detail: 'Not a pattern the rules above match, but the outcome of actually loading the view in a headless UI5: whatever the browser said — a control class that will not load, an aggregation UI5 refuses, a binding it cannot parse. It is the render gate\'s pseudo-rule rather than an entry in `RULES`, so it is never emitted by a check; it appears only when `--render` ran and the browser objected. Address it in the config like any other id: `rules: { \'render-error\': false }` or an `exclude` waives it per file (a waived file that then renders clean is reported as a stale waiver), a severity re-weighs it.',
    example: `view->ele( \`Page\` )->ele( \`contnt\` )->tag( \`Button\` )
" XMLView.create refuses the document, so the gate reports it under this id`,
    remedy: `view->ele( \`Page\` )->ele( \`content\` )->tag( \`Button\` )
" to downgrade the gate itself instead: rules: { 'render-error': 'warning' }`,
  },

  /* ── version and deprecation ────────────────────────────────────────── */
  'unknown-icon': {
    category: 'version',
    summary: '`sap-icon://textFormatting` — a glyph the font has in no release',
    detail: 'An unknown icon name is not an error anywhere: `IconPool` resolves it at render time, finds nothing, and the control renders with **no icon at all**. Nothing is logged — not in the browser console, not in ui5lint, not in abaplint — so it ships and surfaces months later as "not all icons are shown". Case matters and not in the way it looks: `IconPool.getIconInfo` parses the URI and reads `parts.hostname`, which is lower-cased, so `textFormatting` is not "nearly right" — it matches nothing, in every release, forever. The name is `text-formatting`. Judged against `data/icons.json`, the icon registry of every OpenUI5 minor from 1.71 up; a collection-qualified name (`sap-icon://tnt/actor`) belongs to a custom font and is never judged.',
    example: `view->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://textFormatting\` )`,
    remedy: `view->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://text-formatting\` )`,
    fixNote: 'Where exactly one glyph of the font is the written name up to letter case and hyphens — `textFormatting` for `text-formatting`, the camelCase miss the message describes — the finding names it and `--fix` rewrites the name after `sap-icon://`. Wherever the name is written: an attribute value, a constant, a row of a status table.',
  },
  'icon-too-new': {
    category: 'version',
    summary: 'an icon that reached the font after your target version',
    detail: 'The same silence as `unknown-icon`, one release boundary later: the glyph exists today and did not exist on the release you target, so the control renders without an icon there and nowhere else. `information` arrived in 1.80 (use `message-information`) and `clear-all` in 1.86 (use `eraser`) — both shipped past a green CI and were found by a user on 1.71. The registry\'s floor is 1.71, so a name already present there is recorded as "at or before" and a target below 1.71 is never judged.',
    example: `view->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://information\` )   " @since 1.80 on a 1.71 target`,
    remedy: `view->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://message-information\` )   " in 1.71`,
  },
  'icon-removed': {
    category: 'version',
    summary: 'an icon that left the font again',
    detail: 'The font is nearly, but not quite, additive. `binary` was in the font for exactly one release — 1.104 — and gone again after it; the glyph is spelled `non-binary` (in the font since 1.96) everywhere else. A view written against that one release renders no icon on every release after it. Since a target version is a **floor**, the app also runs on the releases where the name is gone, which is why this is reported independently of the target.',
    example: `view->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://binary\` )   " in the font for 1.104 only`,
    remedy: `view->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://source-code\` )`,
  },

  /* ── abap2UI5 semantics ─────────────────────────────────────────────── */
  'frozen-view-builder': {
    category: 'lifecycle',
    summary: 'the class builds its view with `z2ui5_cl_xml_view` — still supported, but no view rule can read it',
    detail: 'This is the only finding here about what was *not* judged, and it is a recommendation rather than a complaint. `z2ui5_cl_xml_view` was the abap2UI5 view builder before `z2ui5_cl_ui5_view_builder` arrived; it still compiles, still renders, and the plan is for it to move into a separate addon rather than to vanish — so an app that stays on it is making a legitimate choice. What that choice costs is this gate. The linter reconstructs a view from the current builder\'s five verbs (`ele`, `tag`, `a`, `end`, `stringify`); the old API is a different one, so there is no view to judge and every other rule stays silent for lack of anything to read — except `obsolete-custom-control`, which reads the old builder\'s `_z2ui5( )->timer( )` helpers by name. Worth saying out loud, because until this rule existed such a class was not even collected: a whole app on the old builder came back as "no checkable app classes" and exit 0, which reads like approval. Rewrite the chain on `z2ui5_cl_ui5_view_builder` and the whole gate applies again — controls, properties, bindings, render — which is the real argument for switching. Reported as a warning, not an error: nothing here is broken today. An app that is staying on the old builder for now says so once, in its config: `"rules": { "frozen-view-builder": "hint" }`, or `false` to switch it off.',
    example: `DATA(view) = z2ui5_cl_xml_view=>factory( ).   " the old builder — nothing below this line is checked
view->page( )->button( text = \`hi\` ).`,
    remedy: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( \`Page\` )->tag( \`Button\` )->a( n = \`text\` v = \`hi\` ).`,
  },
  'obsolete-custom-control': {
    category: 'lifecycle',
    summary: 'an abap2UI5 custom control marked OBSOLETE upstream (`z2ui5:Timer`, `Focus`, `Scrolling`, `Title`, `LPTitle`, `Favicon`, `Info`, `History`)',
    detail: 'abap2UI5 ships a set of companion controls under the `z2ui5.cc` namespace, and eight of them carry an `// OBSOLETE: replaced by …` header in their own source: each did one job that the framework now does for the app through a released API, and they stay in the frontend only so existing apps keep running — they are on the removal plan, and they must not be used. The replacements, in the names `z2ui5_if_client` releases them under: `Timer` → `client->follow_up_action( )` with `val = client->cs_event-start_timer` and the event and the delay in `t_arg`; `Focus` → `cs_event-set_focus`; `Scrolling` → `cs_event-scroll_to` / `cs_event-scroll_into_view`; `Title` → `cs_event-set_title`; `LPTitle` → `cs_event-set_title_launchpad`; `Favicon` → `cs_event-set_favicon`; `Info` → `client->get( )-s_device` / `client->get( )-s_ui5`; `History` → `client->hash_set( )` / `client->app_state_set_active( )`. The finding names the one that applies. Three spellings are read: a builder tag (`tag( )` naming `Timer` with `ns` set to the `z2ui5` prefix), an XML view or fragment (`<z2ui5:Timer …/>`) — in both, judged by the namespace the prefix is **bound** to, so `<cc:Timer xmlns:cc="z2ui5.cc">` is reported and a `sap.m.Title` or a `core:Title` never is — and the frozen builder\'s helpers (`view->_z2ui5( )->timer( )`, `->focus( )`, `->scrolling( )`, `->title( )`, `->lp_title( )`, `->favicon( )`, `->info_frontend( )`, `->history( )`), which are read even on a class `frozen-view-builder` otherwise leaves unjudged. The other companion controls (`Storage`, `MessageManager`, `MultiInputExt`, `Dirty`, `Geolocation`, `CameraPicture`, …) are not obsolete and are not reported. An error by project decision, not because the view breaks today: the render gate still creates it. No `--fix`: a control that sits in the view becomes a call in the class, usually in another method and on another roundtrip, which is a rewrite rather than a mechanical edit.',
    example: `view->tag( n = \`Timer\` ns = \`z2ui5\`   " xmlns:z2ui5="z2ui5.cc"
    )->a( n = \`delayMS\`  v = \`2000\`
    )->a( n = \`finished\` v = client->_event( \`TICK\` ) )`,
    remedy: `client->follow_up_action( val   = client->cs_event-start_timer
                          t_arg = VALUE #( ( \`TICK\` ) ( \`2000\` ) ) )`,
  },
  'chain-indentation': {
    category: 'layout',
    summary: 'a builder call whose indentation contradicts the tree it builds',
    detail: 'A builder chain is the one part of an abap2UI5 class that nothing else formats: abaplint has `indentation` and `in_statement_indentation` switched off (a chain is a single statement spanning fifty lines), so neither `abaplint --fix` nor the auto-format workflow ever touches its inner lines. And the reader has no other picture of the view — the XML the builder emits is one long line by construction, so **the ABAP indentation IS the view\'s structure**. When it drifts, the tree in the file stops matching the tree in the browser. What is judged is only that: a sibling written at a different column than the siblings it shares a parent with, or a call written to the LEFT of the element it belongs to. The SIZE of the indent step is not judged — two and four are both house styles in the wild, and the first child under a node defines the column its siblings are held to, so a chain that keeps its own rhythm is never reported. Neither is the column of `end( )` (the hanging close is established), nor `v =` alignment, nor line length, nor a chain written entirely on one line. A hint: the view renders identically either way.',
    example: `)->ele( \`Page\`
    )->tag( \`Input\`
  )->tag( \`Button\`   " a sibling of Input, written a level out`,
    remedy: `)->ele( \`Page\`
    )->tag( \`Input\`
    )->tag( \`Button\``,
  },
  'chain-element-per-line': {
    category: 'layout',
    summary: 'several controls on one line of a multi-line chain',
    detail: 'One element per line is what makes the indentation able to show the tree at all — a line holding three controls hides three levels of it. Only ELEMENTS count: an attribute on the same line as the control it belongs to hides nothing, so `)->tag( `Text` )->a( n = `text` v = `{TITLE}` )` is the compact one-control form half the samples (and abap2UI5\'s own startup app) are written in and is never reported. Closing calls do not count either, because `)->end( )->end( ).` as a chain\'s last line is an established ending. Reported only for a chain already written across several lines, so the one-liner stays available. A hint, like its neighbour.',
    example: `)->tag( \`Input\` )->tag( \`Button\` )->tag( \`Text\` )   " three controls, one line`,
    remedy: `)->tag( \`Input\`
)->tag( \`Button\`
)->tag( \`Text\``,
  },
  'chain-house-layout': {
    category: 'layout',
    summary: 'a chain not in the abap2UI5 house layout (opt-in)',
    detail: 'The only rule here that encodes a HOUSE STYLE rather than an inconsistency, and the only one that names a step. Its two neighbours judge a chain against itself and stay silent on any layout that is merely a choice; this one judges it against one canonical form: **one call per line including attributes** (stricter than `chain-element-per-line`, which lets an attribute share its control\'s line), **four spaces per level of the tree**, and the closing call alone in the column of the element it closes. It exists because that form now has a corpus behind it — abap2UI5, abap2UI5/samples and abap2UI5/samples-controls were unified onto it in 2026-08, and the drift it catches had passed every other gate: 77 ports whose whole chain sat one level too deep, which `chain-indentation` cannot see because a uniformly wrong rhythm is still a rhythm. **If your house style is a different one, switch it off** — `"chain-house-layout": false` — rather than reformatting to somebody else\'s taste. Every finding carries fixes, so `--fix` rewrites the chain; the rewrite only ever touches whitespace between chain segments and the indent of a continuation line that is not itself content, so it cannot change what the view builds.',
    example: `)->ele( \`Shell\` )->ele( \`Page\` )      " two levels on one line, and the step is 0
)->tag( \`Text\` )->a( n = \`text\` v = \`x\` )   " attribute on its control's line`,
    remedy: `)->ele( \`Shell\`
    )->ele( \`Page\`
        )->tag( \`Text\`
            )->a( n = \`text\` v = \`x\` )`,
    fixNote: 'The chain is rewritten into the canonical layout: each call moved onto its own line at the column its depth in the tree gives it, and the continuation lines of a call\'s arguments moved with it. Only whitespace BETWEEN chain segments is touched — a literal, a comment\'s text and the inside of an argument list are copied through, and blank lines and comment lines between segments are kept where they are. The rewrite is checked to be whitespace-only before it is offered, so it cannot change what the view builds.',
  },
  'portable-app': {
    category: 'portable',
    summary: 'outside the abap2UI5 protocol\'s portable profile v1 (opt-in)',
    detail: 'Off until a config asks for it — `"rules": { "portable-app": "error" }` — because it reports no defect: an app outside the profile runs on the UI5 frontend exactly as written. What it reports is everything that keeps the app from running unchanged on a **non-UI5 frontend** too (the UI5 Web Components frontend abap2UI5/frontend-webcomponent, an Adaptive Cards renderer, an agent): the abap2UI5 protocol\'s portable profile v1 (abap2UI5/protocol `profiles/portable.md`) is the subset of the view vocabulary every portable renderer MUST render — 61 controls with their listed members, the binding forms, a restricted expression grammar, the event wires and argument descriptors, the frontend actions and the client API. The linter judges against a verbatim copy of `profiles/portable-v1.json` (`data/portable-v1.json`, source commit in `data/portable-v1.source.json`, refreshed by `npm run sync-portable-profile`). One rule id, and every finding says which part of the profile it misses: **control** (a control the profile does not list — `sap.f`, `sap.ui.table`, `sap.uxap`, MenuButton, … — or XML templating), **custom-control** (a `z2ui5.cc.*` control: bound to the UI5 runtime), **member** (a property, aggregation, event or association the profile does not list for that control, a `core:require` or a custom-data attribute), **binding** (a named model other than `device>`, an `odata` type, an app formatter, a binding-info key it does not list), **expression** (a `{= … }` construct outside the grammar: `RegExp`, `odata.*`, a call or member it does not list), **event-wire** (`prevent_default_expr`), **event-argument** (`$event`, `$controller`, a method call on a UI5 object, an event parameter or `$source` property outside the closed lists), **frontend-action** (a `follow_up_action( )` / `_event_client( )` action outside the client-API list — `CONTROL_BY_ID`, `BINDING_CALL`, the launchpad actions, custom JavaScript), **nested-view** (`nest_view_display( )` & co.: the protocol\'s decision Q1 keeps NEST/NEST2 tolerated-not-rendered in portable renderers, so a portable app must not use them) and **client-api** (`view_display( switch_default_model_path = … )`). A portable renderer shows a placeholder for an unknown control, ignores an unknown member and skips an unknown action — nothing fails, the app just looks incomplete there. Waive one class with `" abap2ui5lint-disable portable-app` at its top, or a path with the rule\'s `exclude` list.',
    example: `view->tag( \`Slider\` ).
view->tag( \`Text\` )->a( n = \`text\` v = \`{= RegExp('^A').test(\${/NAME}) }\` ).
client->nest_view_display( val = view->stringify( ) id = \`box\` method_insert = \`addItem\` ).`,
    remedy: `view->tag( \`StepInput\` ).
view->tag( \`Text\` )->a( n = \`text\` v = \`{= \${/NAME}.startsWith('A') }\` ).`,
  },
  'missing-view-display-on-navigated': {
    category: 'lifecycle',
    summary: 'a `check_on_navigated( )` branch that never re-displays the view',
    detail: "When a called app leaves, the browser still shows THAT app's view — returning control alone changes nothing on screen. The `check_on_navigated( )` branch has to hand a view back with `client->view_display( )`. A branch that only reads the result and falls through leaves the screen showing the wrong app, with no error anywhere. A negated guard — `IF client->check_on_navigated( ) = abap_false. RETURN. ENDIF.` — is judged on what follows it, which is the navigated path. `view_model_update( )` used to count as a re-display here and no longer does: it is an empty method now (`obsolete-model-update`), and the automatic model push that replaced it reaches the MAIN slot — which is still holding the called app's view.",
    example: `IF client->check_on_init( ).
  client->view_display( render_view( ) ).
ELSEIF client->check_on_navigated( ).
  result = client->get_app( client->get( )-s_draft-id ).
ENDIF.`,
    remedy: `IF client->check_on_init( ).
  client->view_display( render_view( ) ).
ELSEIF client->check_on_navigated( ).
  result = client->get_app( client->get( )-s_draft-id ).
  client->view_display( render_view( ) ).   " without this the sub-app stays on screen
ENDIF.`,
    fixNote: 'The init branch\'s own display statement (the same method, exactly one statement at its level that displays) is written as the navigated branch\'s last statement. With none or several to copy, the finding stays without a fix.',
  },
  'missing-on-navigated-branch': {
    category: 'lifecycle',
    summary: 'a lifecycle dispatcher with no `check_on_navigated( )` branch at all',
    detail: "`check_on_init( )` means \"this app INSTANCE never ran\", not \"the app starts\" — abap2UI5 flips the flag after the very first roundtrip. So it is false on three roundtrips that put the app back on screen: a called app leaving through `nav_app_leave( )`, one of the built-in `z2ui5_cl_pop_*` value helps returning (those run over `nav_app_call` too), and a bookmarked draft being restored. All three raise `check_on_navigated( )` — a called app that leaves with an event (`nav_app_leave( event = … )`, how the confirm and select popups hand back their result) raises that event on the same roundtrip, which is why a class that calls other apps keeps its event arms AHEAD of the navigated arm. With no branch for it `main( )` does nothing, the response carries no display, and the model is pushed into a MAIN slot still holding the other app's view. The screen stays wrong with no error anywhere — which is why an app written this way works perfectly until the day something navigates into it. This is the complement of `missing-view-display-on-navigated`, which judges a branch that exists but never displays; the two never fire on the same class. An app whose display is not gated by the lifecycle at all — a `view_display( )` after the `IF`/`ELSEIF` chain, or the `client->nav_app_leave( )` a popup helper ends on — is correct as it stands and is not reported. The remedy is a rename, not a second branch: `check_on_init( )` implies `check_on_navigated( )` (every path to an instance's first `main( )` raises the navigated flag too), so dispatching the display on `check_on_navigated( )` covers the first start AND every hop back — and an `ELSEIF check_on_navigated( )` twin added under an init branch that only displays is the fork `redundant-init-display` reports. Keep a `check_on_init( )` branch only for what must happen once: `model_init( ). view_display( ).` in the init arm ahead of the navigated arm is a fork that decides something, and stays.",
    example: `IF client->check_on_init( ).
  view_display( ).
ELSEIF client->check_on_event( ).
  on_event( ).
ENDIF.`,
    remedy: `IF client->check_on_navigated( ).   " true on the first start too: check_on_init( ) implies it
  view_display( ).
ELSEIF client->check_on_event( ).
  on_event( ).
ENDIF.`,
    fixNote: 'An `ELSEIF client->check_on_navigated( ).` branch is written before the token that ends the init branch, carrying a copy of the init branch\'s own display statement — only when that branch has exactly one statement at its own level that displays (directly, or through a method of the class) and that statement reads no variable the branch declares; otherwise the finding stays without a fix. In a class that calls other apps (`nav_app_call`) the branch is written LAST in the chain instead, behind the event arms a returning app\'s event has to reach, and a chain ending in `ELSE` is left without a fix.',
  },
  'unconditional-popup-display': {
    category: 'lifecycle',
    summary: 'a `popup_display( )` at the top level of `main( )` — the dialog is rebuilt on every roundtrip',
    detail: '`popup_display( )` and `popover_display( )` load the fragment anew and open it every time they are called — the frontend has no "unchanged, keep it" path for a popup the way it has for the main view. A call at the top level of `main( )`, outside every branch and behind no guard, therefore runs on EVERY event the app receives: typing into a field in the dialog fires its `change`, the roundtrip rebuilds the dialog, the field loses focus, the scroll position resets. Every popup class in the framework itself displays from its `check_on_init( )` branch or behind a `RETURN` guard. Only `z2ui5_if_app~main` is judged, and only where no `RETURN`, `LEAVE`, `CHECK` or `EXIT` precedes the call — a guard block that leaves the method makes everything after it conditional.',
    example: `METHOD z2ui5_if_app~main.
  IF client->check_on_init( ).
    init( ).
  ENDIF.
  client->popup_display( render_dialog( ) ).   " every roundtrip
ENDMETHOD.`,
    remedy: `METHOD z2ui5_if_app~main.
  IF client->check_on_init( ).
    init( ).
    client->popup_display( render_dialog( ) ).   " once
  ENDIF.
ENDMETHOD.`,
  },
  'display-after-nav-app-call': {
    category: 'lifecycle',
    summary: 'a display call after `nav_app_call( )` in the same flow',
    detail: '`nav_app_call( )` hands the roundtrip to another app: what the browser shows next is THAT app\'s view. A `view_display( )` issued behind it, in the same statement sequence, builds a view nobody sees — and a `popup_display( )` behind it opens a dialog over the app being left. Nearly always a missing `RETURN` after the call. Judged on the sequence the call sits in: a display in a nested block, or after an `ELSE`/`WHEN`/`ENDIF` boundary, is another flow and is not reported.',
    example: `METHOD on_event.
  client->nav_app_call( NEW zcl_detail( id ) ).
  client->view_display( render( ) ).   " never seen
ENDMETHOD.`,
    remedy: `METHOD on_event.
  client->nav_app_call( NEW zcl_detail( id ) ).
  RETURN.
ENDMETHOD.`,
  },
  'double-display-in-branch': {
    category: 'lifecycle',
    summary: 'the same slot displayed twice in one flow — the first call is dead',
    detail: 'Two `view_display( )` calls in the same statement sequence — or two `popup_display( )`, two `nest_view_display( )` — hand the frontend two documents for one slot in one roundtrip, and only the last one is ever shown. The first is dead code, and the view it built is usually a different one: the shape is a display left behind after a refactoring, or a fallthrough display under a `CASE` whose branches already display. A display inside a nested block counts as its own flow and is not paired with one outside it.',
    example: `METHOD main.
  client->view_display( render_list( ) ).   " replaced before it is seen
  client->view_display( render_detail( ) ).
ENDMETHOD.`,
    remedy: `METHOD main.
  client->view_display( render_detail( ) ).
ENDMETHOD.`,
  },

  /* ── data and usability ─────────────────────────────────────────────── */
  'raw-javascript-to-frontend': {
    category: 'frontend-wires',
    summary: 'raw JavaScript shipped to the browser — via `follow_up_action` or the view',
    detail: 'abap2UI5\'s frontend is a **renderer**: behaviour travels as data (bindings, `cs_event-` actions), never as code. Five shapes break that line, all invisible to every gate and to anyone reading the ABAP: a non-name `val` in `follow_up_action( )` (the raw-JS escape hatch — inserted verbatim as `custom_js`), a hand-written handler string on an event attribute (UI5 evaluates it as JavaScript), a `<script>` tag inside an attribute value (the `core:HTML` route), an inline `on…=` handler on an element of such markup, and a `javascript:` URL in a URI-typed property (`href`, `src`). The last two do not even run: the default content security policy carries no `\'unsafe-inline\'`, so the browser refuses them and says so in the console only. Use a `cs_event-` frontend action, a `client->_event*( )` wire or backend logic instead. A repo that deliberately allows the escape hatch can lower or disable the rule in its `abap2ui5lint.jsonc`.',
    example: `client->follow_up_action( val = \`sap.ui.getCore().byId('x').focus()\` ).   " raw JS`,
    remedy: `client->follow_up_action( val = client->cs_event-set_focus t_arg = VALUE #( ( \`x\` ) ) ).`,
  },
  // --- 2026-09-25: the app guide and z2ui5_if_client's ABAP Doc, read as rules
  /* ── directives ─────────────────────────────────────────────────────── */
  'unknown-directive-rule': {
    category: 'directives',
    summary: '`" abap2ui5lint-disable-next-line binding-to-locl` — no such rule',
    detail: 'A directive names a rule id nothing emits, so it waives nothing — and the finding it was written for is still reported one line down, which reads as the linter ignoring the comment. It used to be exactly that silent. The same closed set the config\'s `rules` block is checked against decides it: a rule id is the name printed at the end of every reported line (`abap2ui5lint --explain` lists them all). `render-error` is named separately, because a directive can never address it: a render failure has no source line, and the way to waive the gate per file is `rules[\'render-error\']` in `abap2ui5lint.jsonc`. A warning rather than an error - the code is fine, the suppression is not.',
    example: `" abap2ui5lint-disable-next-line Unknown-Property
view->tag( \`Button\` )->a( n = \`typ\` v = \`Emphasized\` ).`,
    remedy: `" abap2ui5lint-disable-next-line unknown-property
view->tag( \`Button\` )->a( n = \`typ\` v = \`Emphasized\` ).`,
    fixNote: 'Where exactly one rule id is the written name up to letter case and `-`/`_` (lib/suggest.mjs, the same did-you-mean the config and `--explain` make), the finding names it and `--fix` rewrites the id inside the directive. Anything less exact than that is reported without a suggestion; the linter does not guess at edit distances.',
  },
  'unused-directive': {
    category: 'directives',
    summary: 'a `abap2ui5lint-disable…` directive that suppressed nothing',
    detail: 'The directive is in place, the rule it names never fired where it points - the code moved, the rule was tightened, or the id was never the one that reported. ESLint\'s `--report-unused-disable-directives`, on by default here for the reason the baseline refuses a stale entry: a suppression that outlives its finding hides the next real one on that line. A directive naming several ids is judged per id, a bare directive (no id, every rule) by whether it waived anything at all - and a bare directive cannot excuse its own finding, or every dead catch-all would be self-satisfied; `" abap2ui5lint-disable unused-directive`, which names the rule on purpose, may. A hint: nothing is wrong with the code, only with what the file says about it. Switch it off per repo with `"unused-directive": false` if a corpus keeps directives ahead of a rule it plans to enable.',
    example: `" abap2ui5lint-disable-next-line unknown-property
view->tag( \`Button\` )->a( n = \`type\` v = \`Emphasized\` ).`,
    remedy: `view->tag( \`Button\` )->a( n = \`type\` v = \`Emphasized\` ).`,
    fixNote: 'A `-disable-next-line` or `-disable-line` directive that suppressed nothing at all is deleted: the whole line when the comment has it to itself, otherwise the comment alone. A block directive (`-disable` … `-enable`) is reported without a fix, because deleting one half of the pair is a guess, and so is a directive of which only some ids are dead - trimming an id out of a list is left to the reader.',
  },
};

/* The rules written as one unit (lib/rule.mjs) carry their card with them;
 * it is listed here so that every reader of RULE_DOCS - `--explain`, the
 * rule page, the JSON schema, an agent through mcp-server - finds all rules
 * in the one table it always read. */
for (const rule of UNIT_RULES) {
  if (rule.id in RULE_DOCS) throw new Error(`rule '${rule.id}' is defined as a unit AND has an entry in RULE_DOCS`);
  RULE_DOCS[rule.id] = docOf(rule);
}
