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

  /* ── data and usability ─────────────────────────────────────────────── */
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
