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
