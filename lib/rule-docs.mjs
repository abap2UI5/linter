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
  /* The render gate's pseudo-rule: no unit, because no check emits it. */
  'render-error': {
    category: 'structure',
    summary: 'the reconstructed view did not survive a real UI5 render',
    detail: 'Not a pattern the rules above match, but the outcome of actually loading the view in a headless UI5: whatever the browser said — a control class that will not load, an aggregation UI5 refuses, a binding it cannot parse. It is the render gate\'s pseudo-rule rather than an entry in `RULES`, so it is never emitted by a check; it appears only when `--render` ran and the browser objected. Address it in the config like any other id: `rules: { \'render-error\': false }` or an `exclude` waives it per file (a waived file that then renders clean is reported as a stale waiver), a severity re-weighs it.',
    example: `view->ele( \`Page\` )->ele( \`contnt\` )->tag( \`Button\` )
" XMLView.create refuses the document, so the gate reports it under this id`,
    remedy: `view->ele( \`Page\` )->ele( \`content\` )->tag( \`Button\` )
" to downgrade the gate itself instead: rules: { 'render-error': 'warning' }`,
  },
};

/* Every rule carries its card in its unit (lib/rule.mjs, lib/rules/); it is
 * listed here so that every reader of RULE_DOCS - `--explain`, the
 * rule page, the JSON schema, an agent through mcp-server - finds all rules
 * in the one table it always read. */
for (const rule of UNIT_RULES) {
  if (rule.id in RULE_DOCS) throw new Error(`rule '${rule.id}' is defined as a unit AND has an entry in RULE_DOCS`);
  RULE_DOCS[rule.id] = docOf(rule);
}
