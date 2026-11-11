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
  'invalid-frontend-action': {
    category: 'frontend-wires',
    summary: 'a frontend-action `t_arg` outside the set the runtime accepts',
    detail: 'A `client->_event_client( )` / `client->follow_up_action( )` wire is dispatched in the browser by name, and a name outside the whitelist raises nothing anywhere: FrontendAction logs to the console and the control does nothing when pressed. Judged only for literal arguments and only where the runtime\'s set is closed — the `CONTROL_GLOBAL` object and its method, the `BINDING_CALL` method, and `CONTROL_BY_ID`\'s obsolete empty view slot (which shifts the method out of position). `CONTROL_BY_ID`\'s method list is open by design and is never judged. A filter-row operator that is an accepted one up to letter case (`contains` for `Contains`) carries a did-you-mean and a `--fix`, since the set is case-sensitive upstream and the miss leaves the binding unfiltered.',
    example: `client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`tab\` ) ( \`items\` ) ( \`filter\` ) ( \`[[["NAME","contains","x"]]]\` ) ) ).`,
    remedy: `client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`tab\` ) ( \`items\` ) ( \`filter\` ) ( \`[[["NAME","Contains","x"]]]\` ) ) ).`,
    fixNote: 'Only the filter-row operator, and only where the written one is an accepted operator up to letter case (`contains` for `Contains`): the token is rewritten inside the payload literal. A global object, a method or an operator no single accepted name matches that way is reported without a suggestion — `MESSAGE_TOASTER` for `MESSAGE_TOAST` is an edit, not a case miss, and the linter does not guess at those.',
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
  'frontend-action-unknown-id': {
    category: 'frontend-wires',
    summary: 'an id-addressed wire naming an id no view declares',
    detail: 'The frontend resolves the first `t_arg` as a control id. When no view of the class gives a control that id — a typo, a renamed control, an id that only ever existed in another app — the lookup fails and the wire does **nothing**: no exception, no failed render, a button that looks connected. `CONTROL_BY_ID` at least logs the miss; `SET_FOCUS`, `SCROLL_TO` and `SCROLL_INTO_VIEW` `return` without even a console line. Judged only when every `id` attribute of the class is a literal; a class that builds ids at runtime is left alone.',
    example: `a( n = \`id\` v = \`messageView\` )
" … t_arg = VALUE #( ( \`messageview\` ) ( \`navigateBack\` ) )   " no control answers to it`,
    remedy: `a( n = \`id\` v = \`messageView\` )
" … t_arg = VALUE #( ( \`messageView\` ) ( \`navigateBack\` ) )`,
    fixNote: 'Where exactly one id a view of this class declares is the written id up to letter case (`messageview` for `messageView`), the finding names it and `--fix` rewrites the literal inside its own quotes. An id no declared id matches that way is reported without a suggestion.',
  },
  'unknown-frontend-action': {
    category: 'frontend-wires',
    summary: 'a literal action name outside the frontend dispatch table',
    detail: 'A `client->_event_client( )` / `client->follow_up_action( )` naming its action as a string literal is dispatched exactly like the `cs_event-` constant — but the constant is compile-checked and the literal is not, and `FrontendAction.execute` looks the name up in its handler table and does **nothing at all** on a miss: no exception, not even a console line. Case matters — the runtime never upper-cases, so `set_title` misses where `SET_TITLE` works. Anything not name-shaped is `follow_up_action`\'s raw-JavaScript escape hatch and is not judged.',
    example: `client->follow_up_action( val = \`set_title\` t_arg = VALUE #( ( \`Hi\` ) ) ).   " the table is case-sensitive: swallowed silently`,
    remedy: `client->follow_up_action( val = client->cs_event-set_title t_arg = VALUE #( ( \`Hi\` ) ) ).`,
    fixNote: 'Only when the written name is a dispatch-table name up to letter case (`set_title` for `SET_TITLE`): the literal is rewritten. Any other name keeps the finding.',
  },
  'unknown-view-slot': {
    category: 'frontend-wires',
    summary: 'a literal view slot outside MAIN / NEST / NEST2 / POPUP / POPOVER',
    detail: 'The `view` parameter (and `SET_SIZE_LIMIT`\'s view key) names one of the five slots, case-sensitively: the server compares it as an ABAP string and the browser uses it as an object key. The natural guesses all miss — `main` (lower case), and `NESTED` for `cs_view-nested`, whose VALUE is `NEST`. For `CONTROL_BY_ID` a wrong slot is worse than none: a named slot **suppresses the global id fallback**, so the wire dies although the id exists in an open view. A slot that is a real one up to letter case (`main` for `MAIN`) carries a did-you-mean and a `--fix`; `NESTED` is not one and keeps the finding.',
    example: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = \`main\`   " the slot is MAIN - and \`NESTED\` would be NEST
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
    remedy: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = client->cs_view-main
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
    fixNote: 'Only where the written slot is one of the five up to letter case (`main` for `MAIN`): the literal is rewritten in place, inside its own quotes. `NESTED` matches nothing that way and keeps the finding — the constant `cs_view-nested` spells `NEST`, which is the author\'s to write.',
  },
  'literal-view-slot': {
    category: 'frontend-wires',
    summary: 'a view slot retyped as a string where `cs_view` has a constant for it',
    detail: 'The mirror image of `unknown-view-slot`, and the reason that rule keeps finding work to do. `view = \`MAIN\`` is correct — and nothing checks it: the value travels to the browser as an object key, so a rename, a typo or the wrong half of the pairing dispatches to no view at all, silently. `client->cs_view-main` cannot fail that way, because the ABAP compiler resolves the name: `cs_view-mian` does not activate. It also spells the one pairing nobody remembers — the constant is `cs_view-nested` and its VALUE is `NEST`, `cs_view-nested2` is `NEST2` — which is exactly the mistake `unknown-view-slot` reports once the literal is written out. A hint, because the wire works today; `--fix` writes the constant in place.',
    example: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = \`NEST\`   " works, but nothing checks it
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
    remedy: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = client->cs_view-nested
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
    fixNote: 'replaces the literal with the `client->cs_view-…` constant carrying that value — an exact one-token substitution, nothing to guess.',
  },
  'invalid-keyboard-shortcut': {
    category: 'frontend-wires',
    summary: 'a shortcut combo that names no key',
    detail: 'The registration normalizes the combo (`Ctrl+Shift+S` → `ctrl+shift+s`, aliases like `cmd`/`return` included) and refuses one that consists of modifiers only — logged once, never registered, and every later keydown simply does nothing. The scope argument is judged separately: a slot key or a declared control id (via `frontend-action-unknown-id`).',
    example: `client->follow_up_action( val   = client->cs_event-keyboard_shortcut
                          t_arg = VALUE #( ( \`Ctrl+Shift\` ) ( \`SAVE\` ) ) )   " modifiers only — binds nothing`,
    remedy: `client->follow_up_action( val   = client->cs_event-keyboard_shortcut
                          t_arg = VALUE #( ( \`Ctrl+Shift+S\` ) ( \`SAVE\` ) ) )`,
  },
  'invalid-action-payload': {
    category: 'frontend-wires',
    summary: 'a JSON action payload the runtime silently downgrades',
    detail: 'The `object`-kind control methods (`setSticky`, `setHiddenInPopin`, `setP13nData`) run their argument through `castArg`, whose catch turns a literal that does not parse as JSON into `{}` — a `setSticky` with a typo\'d payload then *un-sticks* everything instead of failing. For the enum-array payloads the values are judged too: an unknown `sap.m.Sticky` / `sap.ui.core.Priority` key is dropped by UI5 with the same silence. `BINDING_CALL`\'s compound filter-groups JSON is judged the same way, including each row\'s operator.',
    example: `t_arg = VALUE #( ( \`table1\` ) ( \`setSticky\` ) ( \`ColumnHeaders\` ) )   " not JSON -> {}`,
    remedy: `t_arg = VALUE #( ( \`table1\` ) ( \`setSticky\` ) ( \`["ColumnHeaders"]\` ) )`,
  },
  'filter-groups-not-arrays': {
    category: 'frontend-wires',
    summary: 'a `BINDING_CALL` filter payload whose groups are objects — it clears the binding instead of filtering it',
    detail: 'The compound filter form is an array of GROUPS, each an array of `[path, operator, value1, value2?]` ROWS. `buildFilterGroups` keeps only elements that pass `Array.isArray`, so an array of OBJECTS — `[{"path":…,"operator":…,"value1":…}]` — is dropped whole, the group list empties, and control falls into `binding.filter([])`: the filter is **cleared**, never applied. Nothing is logged on that path, because the root *is* an array so the malformed-JSON guard passes and the per-group drop is silent by construction. An intentional clear is `[]`, which is empty to begin with and is not reported.',
    example: `view->tag( \`List\` )->a( n = \`id\` v = \`list\` ).
client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`list\` ) ( \`items\` ) ( \`filter\` )
                                           ( \`[{"path":"NAME","operator":"Contains","value1":"x"}]\` ) ) )   " cleared`,
    remedy: `view->tag( \`List\` )->a( n = \`id\` v = \`list\` ).
client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`list\` ) ( \`items\` ) ( \`filter\` )
                                           ( \`NAME\` ) ( \`Contains\` ) ( term ) ) )   " positional`,
  },
  'raw-javascript-to-frontend': {
    category: 'frontend-wires',
    summary: 'raw JavaScript shipped to the browser — via `follow_up_action` or the view',
    detail: 'abap2UI5\'s frontend is a **renderer**: behaviour travels as data (bindings, `cs_event-` actions), never as code. Five shapes break that line, all invisible to every gate and to anyone reading the ABAP: a non-name `val` in `follow_up_action( )` (the raw-JS escape hatch — inserted verbatim as `custom_js`), a hand-written handler string on an event attribute (UI5 evaluates it as JavaScript), a `<script>` tag inside an attribute value (the `core:HTML` route), an inline `on…=` handler on an element of such markup, and a `javascript:` URL in a URI-typed property (`href`, `src`). The last two do not even run: the default content security policy carries no `\'unsafe-inline\'`, so the browser refuses them and says so in the console only. Use a `cs_event-` frontend action, a `client->_event*( )` wire or backend logic instead. A repo that deliberately allows the escape hatch can lower or disable the rule in its `abap2ui5lint.jsonc`.',
    example: `client->follow_up_action( val = \`sap.ui.getCore().byId('x').focus()\` ).   " raw JS`,
    remedy: `client->follow_up_action( val = client->cs_event-set_focus t_arg = VALUE #( ( \`x\` ) ) ).`,
  },
  'denied-control-method': {
    category: 'frontend-wires',
    summary: 'a `CONTROL_BY_ID` wire naming a method the frontend denylist refuses',
    detail: 'The wire\'s ALLOWED side is open by design — any public control method runs, so ordinary setters and toggles need no whitelist entry. The DENIED side is a closed set, and it is silent in the same way a wrong id is: `FrontendAction` logs "method not allowed" and returns, so the ABAP compiles, the view renders and the button does nothing. Denied are the methods that would break the framework\'s own invariants — teardown and reparenting (`destroy`, `exit`, `setParent`, `addDependent`, `placeAt`), model and binding swaps (`setModel`, `setBinding*`, `bind*`/`unbind*`), event-handler tampering (`attach*`/`detach*`, `fireEvent`), the render lifecycle (`rerender`, `invalidate`) and the GENERIC reflection mutators that take the member name as an argument (`addAggregation`, `removeAllAggregation`, `setAssociation`, …). The NAMED per-aggregation methods are allowed and are never reported: `removeAllItems` and `destroyContent` touch only children the control itself owns, exactly like the long-allowed `removeItem`.',
    example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`list\` ) ( \`destroy\` ) ) )`,
    remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`list\` ) ( \`removeAllItems\` ) ) )`,
  },
  'frontend-action-too-new': {
    category: 'version',
    summary: 'a `CONTROL_GLOBAL` target the target release does not carry yet',
    detail: 'Four of the global targets are resolved with a LAZY `sap.ui.require`, and deliberately so: a hard dependency on a module the running release does not have 404s and takes the whole component down with it. What that buys in robustness it pays for in silence — below its release the require returns `undefined`, the dispatch hits its "not available" guard, and the wire does nothing at all. `THEMING.setTheme` needs 1.118, `FORMATTING.setCustomCurrencies`/`addCustomCurrencies` 1.120, `INVISIBLE_MESSAGE.announce` 1.78, and `POPUP.setWithinArea` 1.89 (there the module is old and only the method is new). This is the version half of the wire family: `member-too-new` and its siblings judge what the VIEW writes, and nothing judged what the class SENDS.',
    example: `follow_up_action( val   = client->cs_event-control_global
                  t_arg = VALUE #( ( \`THEMING\` ) ( \`setTheme\` ) ( \`sap_horizon\` ) ) )   " @since 1.118`,
    remedy: `follow_up_action( val   = client->cs_event-control_global
                  t_arg = VALUE #( ( \`MESSAGE_TOAST\` ) ( \`show\` ) ( \`saved\` ) ) )`,
  },
  'control-call-arg-count': {
    category: 'frontend-wires',
    summary: 'more `t_arg` values than the control method declares',
    detail: 'The frontend declares the argument kinds of every control method it knows, and `castArgs` ends on `kinds.slice(0, count)` — so an argument past the declared ones is never passed to the control. It is not an error anywhere: the call runs, with fewer arguments than the source appears to give it, and the extra value reads as intent to every later reader. `back`, `close`, `focus`, `collapseAll` and the other no-argument methods are the common case; `setExpanded` given two is the other. A method the frontend does NOT declare is open by design (any public, non-denylisted one) and is never judged on arity.',
    example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`nav\` ) ( \`back\` ) ( \`page2\` ) ) )   " back takes none`,
    remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`nav\` ) ( \`back\` ) ) )`,
  },
  'control-call-arg-kind': {
    category: 'frontend-wires',
    summary: 'a `t_arg` value that is not the kind the control method declares',
    detail: 'The declared kinds are not decoration — `castArg` acts on them. An `int` argument runs through `Number( )`, so a non-numeric literal arrives as `NaN` and every comparison against it is false: `sap.m.Button`\'s badge setters compare the incoming value against the stored bound, so the value is dropped into an `else` whose only effect is a `Log.warning`. A `bool` argument is `raw === "true" || raw === "X"` and nothing else, so a literal meant as true in any other spelling — `1`, `TRUE`, `abap_true`, `Y` — silently arrives as FALSE and switches the flag the wrong way. The ABAP boolean tokens (`X`, a space, the empty string) and the literal `true`/`false` are the accepted spellings and are never reported.',
    example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`panel\` ) ( \`setExpanded\` ) ( \`abap_true\` ) ) )`,
    remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`panel\` ) ( \`setExpanded\` ) ( \`X\` ) ) )`,
    fixNote: 'A `bool` argument spelled as a boolean whose meaning is not in doubt is rewritten inside its literal: `abap_true` and a lower-case `x` to `X`, any letter case of `true` to `true`, and `abap_false` / `FALSE` — which already arrive as false — to `false`. `1`, `Y`, a word and every `int` argument keep the finding without a fix.',
  },
  'invalid-aggregation-item': {
    category: 'frontend-wires',
    summary: 'a slashed control id that addresses no aggregation item',
    detail: 'A cloned aggregation item has no id the backend can know — the rendered one carries the view prefix the framework assigns at runtime — so it is addressed positionally as `<id>/<aggregation>/<index>` (0-based) and resolved in the browser. Two ways to get that wrong, and the id rules around this one see neither, because they judge the head segment alone: a slashed value that does not MATCH the shape (a non-numeric index, a fourth segment) never enters the aggregation path at all and is looked up as one plain id, which resolves to nothing; and a shape that matches but names an aggregation the control does not declare makes `getAggregation` return nothing, so the wire is dropped with a log. The aggregation half is judged only when the head id resolves to a control the snapshot knows.',
    example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`carousel/pages/first\` ) ( \`setActivePage\` ) ) )`,
    remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`carousel/pages/0\` ) ( \`setActivePage\` ) ) )`,
  },
  'navigation-lost-on-rebuild': {
    category: 'frontend-wires',
    summary: 'a container navigated only from a handler while a bound field keeps the page — the rebuild shows another',
    detail: 'The twin of `control-state-lost-on-rebuild` for the calls that are no setters: `to`, `backToPage`, `toDetail`, `toMaster` on a NavContainer, a SplitApp or a FlexibleColumnLayout. A container\'s current page is live control state — `view_display( )` destroys the slot and `XMLView.create` builds the container afresh on its `initialPage` — while a two-way bound field is class state and survives. A class that navigates from an event handler and KEEPS the position in such a field therefore contradicts itself after every rebuild (a draft restore, a called app handing control back, any later `view_display( )`): the field still names the page the user navigated to, the container shows the first one, and whatever reads the field — a SideNavigation\'s `selectedKey`, a breadcrumb — tells the user something that is not on screen (samples-controls app 585). Reported when a bound field names a page of that container: the call navigates to the field itself, the method that issues it copies its target into the field (or the field into the target), or a literal the field holds is the id of one of the container\'s pages. A non-literal target alone is not enough — a call to `get_event_arg( )` next to a bound SplitApp mode is correct — and the stack-relative calls (`back`, `navigateBack`) are not judged, since a rebuild empties the stack they move along. Any navigation of the SAME container from a method on the display path silences every wire on it: re-issuing `to( selectedkey )` there, guarded by the field, is the remedy, whatever argument the handler sends. A method that displays a popup counts as the display path.',
    example: `PUBLIC SECTION.
  DATA selectedkey TYPE string.
METHOD view_display.
  view->tag( \`Select\` )->a( n = \`selectedKey\` v = client->_bind( selectedkey ) ).
  client->view_display( view->stringify( ) ).
ENDMETHOD.
METHOD on_event.
  selectedkey = client->get_event_arg( ).   " the page the user picked
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`pageContainer\` ) ( \`to\` ) ( selectedkey ) ) ).
ENDMETHOD.`,
    remedy: `PUBLIC SECTION.
  DATA selectedkey TYPE string.
METHOD view_display.
  view->tag( \`Select\` )->a( n = \`selectedKey\` v = client->_bind( selectedkey ) ).
  client->view_display( view->stringify( ) ).
  IF selectedkey IS NOT INITIAL.   " the rebuilt container starts on its initialPage
    client->follow_up_action( val   = client->cs_event-control_by_id
                              t_arg = VALUE #( ( \`pageContainer\` ) ( \`to\` ) ( selectedkey ) ) ).
  ENDIF.
ENDMETHOD.
METHOD on_event.
  selectedkey = client->get_event_arg( ).
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`pageContainer\` ) ( \`to\` ) ( selectedkey ) ) ).
ENDMETHOD.`,
  },
  'control-state-lost-on-rebuild': {
    category: 'frontend-wires',
    summary: 'a `CONTROL_BY_ID` `set…( )` that no binding can carry, issued only off the display path',
    detail: 'The exact inverse of `settable-property-via-action`, and its blind spot. That rule fires when the setter matches a **bindable property** and says "bind it instead"; it is silent for the three shapes where that answer does not exist — an **association** (`setNextStep`, `setSelectedSection`, `setActivePage`, `setCurrentStep`), a **function-typed property** (`sap.m.MessagePopover.asyncURLHandler`) and a method that is **no member at all** (`setBadgeMinValue`: `sap.m.Button` declares `badgeStyle` as its only badge property and keeps the bounds in private fields `Button.init` resets to 1/9999). Those three are live control state, and abap2UI5 does not patch a view — `view_display( )` hands new XML to the VIEW_SLOTS action, whose `displayMain` destroys the MAIN slot (taking POPUP and POPOVER with it) and builds a fresh tree with `XMLView.create`. Every control in it is a new object carrying what the XML declares and nothing else. A bound property survives that, because the binding re-applies; this state does not. So a class that sets it from an event handler and never re-issues it from the display path loses it on the next rebuild — a restored draft, a called app handing control back, any later `view_display( )` — while the ABAP field describing it survives as class state, and the app then contradicts itself. The remedy is to re-issue the call from the method that displays the view (samples-controls app 249 re-sends both badge bounds from the values it kept; app 534 ends `view_display( )` on the `path_apply( )` that wires the whole wizard path). Deliberately narrow: only a **non-literal** value is judged, because a constant carries no class state for the rebuilt view to contradict — `setCurrentStep( \'ProductInfoStep\' )` is a one-shot corrective jump and `setSelectedSection( \'\' )` a reset to null, and re-issuing either on every rebuild would be the defect. A wire is silent when its own method issues a display call, when any method on that path (a helper it calls, a few levels deep) issues the same id+setter, and — the same thing seen from the other side — when it is queued next to a `popup_display( )`/`popover_display( )`, since the system-action phase is awaited before the follow-up actions run.',
    example: `METHOD on_event.
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`step1\` ) ( \`setNextStep\` ) ( next_step ) ) ).
ENDMETHOD.`,
    remedy: `METHOD view_display.
  client->view_display( view->stringify( ) ).
  " the same id+setter, re-issued on every rebuild
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`step1\` ) ( \`setNextStep\` ) ( next_step ) ) ).
ENDMETHOD.`,
  },
  'settable-property-via-action': {
    category: 'frontend-wires',
    summary: 'a `CONTROL_BY_ID` `set…( )` where the control has a bindable property of that name',
    detail: 'The project rule is *prefer a bindable property over a frontend action*: a two-way bound property keeps the state in the model, where it survives a view rebuild, a draft restore and the browser Back button — a frontend action does not, and it also needs a round-trip to be re-applied. Only **properties** are reported: an association (`sap.uxap.ObjectPageLayout.selectedSection`) and an aggregation cannot be data-bound at all, so driving those imperatively is the only way and is never flagged. A hint, not an error — an imperative call can still be the right answer when the sample\'s point is the imperative API itself.',
    example: `view->tag( n = \`DynamicSideContent\` ns = \`l\` )->a( n = \`id\` v = \`sideContent\` ).
client->follow_up_action( val   = client->cs_event-control_by_id
                          t_arg = VALUE #( ( \`sideContent\` ) ( \`setShowSideContent\` ) ( \`true\` ) ) )`,
    remedy: `DATA show_side TYPE abap_bool.
view->tag( n = \`DynamicSideContent\` ns = \`l\` )->a( n = \`showSideContent\` v = client->_bind( show_side ) )`,
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
