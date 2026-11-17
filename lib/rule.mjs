/*
 * rule — one rule, written in one place.
 *
 * A rule used to be five entries in four files: the scan that emits it
 * (abap-rules.mjs and its siblings), its severity and its sentence in
 * describe( ) (findings.mjs), its card in RULE_DOCS (rule-docs.mjs), and -
 * where it applies - its name in FIXABLE, OPT_IN and SOURCE_RULES.
 * Forgetting one of them has happened for each of them. Every rule is one
 * file now (lib/rules/), and those tables are read off it.
 *
 * `defineRule( )` takes all of it as one object:
 *
 *   id         the rule id - what a finding's `type` is
 *   severity   'error' | 'warning' | 'hint', before any `rules` override
 *   category   the group of the rule reference it is listed in
 *   fixable    true for a rule whose findings can carry a fix - its card
 *              then says what the fix rewrites (`fixNote`)
 *   optIn      true for a rule that runs only when the `rules` block asks
 *   scope      where it runs:
 *                'class'  for every ABAP class, also one that builds no view
 *                         (runRules( ) in checkAbapHygiene)
 *                'app'    at its own place in checkAbapRules( ) (runRule( )),
 *                         with the context that place has - the view's
 *                         metadata, the dialect, what other passes found
 *                'node'   at its own place in the property walk (checkNodes( )
 *                         in properties.mjs), once per view node, with what
 *                         the walk knows there: the node, its resolved
 *                         control name and metadata, the control it sits in,
 *                         the row it is bound against, the UI5 floor. ONE walk
 *                         for all of them - a rule does not walk the tree
 *                'document' once per view document, after the walk, with
 *                         its root; what the whole tree declares, uses and
 *                         links is read once (documentFacts( ) in
 *                         view-document.mjs) and shared by every such rule
 *                'tree'   by the reconstructor (lib/reconstruct.mjs) while it
 *                         builds the view tree out of the builder calls, at
 *                         the call that shows the defect: a second write of
 *                         one attribute, a close past the root, unbalanced
 *                         parentheses. What it knows there is what they read
 *                'directive' by applyDirectives( ) (findings.mjs), once per
 *                         `abap2ui5lint-` directive of a source, after its
 *                         findings went through the directives - the rules
 *                         about the directives themselves
 *   message    (finding) -> the one sentence a report prints
 *   check      (context) -> void, calling context.report( finding ) - the
 *              finding without its `type`, which is the rule's id
 *
 * The context a check gets is the SHARED reading of the class
 * (lib/abap-model.mjs) plus what the run knows:
 *
 *   model      abapModel( source ): tokens, statements, methods, sections,
 *              attributes - read once for all rules
 *   source     the raw text (fix spans address it)
 *   report     the collector
 *   options    { minUi5, data, classIndex, ownObjects, rules }
 *
 * The registries the rest of the linter reads - severities, the fixable
 * list - take every rule from here (lib/rules/index.mjs), so there is
 * nothing left to forget: no rule is defined anywhere else.
 *
 * The CARD - the prose a reader is shown - is the rule's other file,
 * lib/rules/<id>.card.mjs, written with `defineCard( )`:
 *
 *   id         the id of the rule it belongs to
 *   summary, detail, example, remedy, fixNote
 *              what `--explain`, the rule page and an agent read.
 *              `example` is the shortest source that triggers the rule,
 *              `remedy` the same source fixed; `fixNote` is given exactly
 *              when the rule is `fixable`
 *
 * Apart because a consumer that only JUDGES a view (`./check` in a browser
 * bundle) has no use for it, and the prose of every rule together was most
 * of what such a bundle grew by when the rules became files (#188). Only
 * lib/rules/cards.mjs imports a card, and only rule-docs.mjs that registry;
 * rule-docs pairs every rule with its card and throws on a gap.
 *
 * A rule module imports nothing that reaches a registry (findings, rule-docs,
 * fix, abap-rules, rules/index): the registries import the rules, so that
 * would be a cycle. What rules share is in the reader modules (abap-model,
 * abap-helpers, ui5-meta, binding-paths, view-document, wire-readers, …). `test/review/rule-units.mjs` holds that
 * line.
 */
export const SEVERITIES = Object.freeze(['error', 'warning', 'hint']);

/** The longest source line abapGit can import (source-line-too-long). Here,
 *  not in findings.mjs, so the rule can read it; findings.mjs re-exports it. */
export const LINE_LIMIT = 255;

/** The id the render gate reports under - not a rule a directive can name
 *  (findings.mjs re-exports it, its public home). */
export const RENDER_RULE = 'render-error';

/** The first `n` characters of a value as text - what a message quotes of a
 *  long literal. */
export const short = (v, n = 80) => String(v ?? '').slice(0, n);
export const SCOPES = Object.freeze(['class', 'app', 'node', 'document', 'tree', 'directive']);

/** The fields of a card (defineCard( )); a rule definition carries none. */
export const CARD_FIELDS = Object.freeze(['summary', 'detail', 'example', 'remedy', 'fixNote']);

const isId = (id) => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/** Validate and freeze one rule definition. Throws on a definition that
 *  would have failed a gate later - at import, with the rule's name. */
export function defineRule(def) {
  const where = `defineRule(${def?.id ? `'${def.id}'` : '?'})`;
  if (!def || typeof def !== 'object') throw new TypeError('defineRule: expected an object');
  for (const key of ['id', 'category']) {
    if (!nonEmpty(def[key])) throw new TypeError(`${where}: '${key}' must be a non-empty string`);
  }
  if (!isId(def.id)) throw new TypeError(`${where}: the id must be kebab-case`);
  /* The prose is the card's, in <id>.card.mjs: written here it would ride
   * into every bundle that only judges a view. */
  const prose = CARD_FIELDS.filter((key) => key in def);
  if (prose.length) throw new TypeError(`${where}: ${prose.join(', ')} belong${prose.length === 1 ? 's' : ''} in the card, lib/rules/${def.id}.card.mjs (defineCard( ))`);
  if (!SEVERITIES.includes(def.severity)) throw new TypeError(`${where}: severity must be one of ${SEVERITIES.join(', ')}`);
  if (!SCOPES.includes(def.scope)) throw new TypeError(`${where}: scope must be one of ${SCOPES.join(', ')}`);
  if (typeof def.message !== 'function') throw new TypeError(`${where}: message must be a function of the finding`);
  if (typeof def.check !== 'function') throw new TypeError(`${where}: check must be a function of the context`);
  if (def.fixable !== undefined && typeof def.fixable !== 'boolean') throw new TypeError(`${where}: fixable, when given, must be true or false`);
  return Object.freeze({ optIn: false, fixable: false, ...def });
}

/** Validate and freeze one rule's card - the prose beside its definition
 *  (lib/rules/<id>.card.mjs). Throws at import, with the rule's name. */
export function defineCard(card) {
  const where = `defineCard(${card?.id ? `'${card.id}'` : '?'})`;
  if (!card || typeof card !== 'object') throw new TypeError('defineCard: expected an object');
  if (!isId(card.id)) throw new TypeError(`${where}: the id must be the kebab-case id of its rule`);
  for (const key of ['summary', 'detail', 'example', 'remedy']) {
    if (!nonEmpty(card[key])) throw new TypeError(`${where}: '${key}' must be a non-empty string`);
  }
  if (card.example === card.remedy) throw new TypeError(`${where}: the remedy is the example - it has to be the same source FIXED`);
  if (card.fixNote !== undefined && !nonEmpty(card.fixNote)) {
    throw new TypeError(`${where}: fixNote, when given, must say what the fix rewrites`);
  }
  const unknown = Object.keys(card).filter((key) => key !== 'id' && !CARD_FIELDS.includes(key));
  if (unknown.length) throw new TypeError(`${where}: a card holds ${CARD_FIELDS.join(', ')} - not ${unknown.join(', ')}`);
  return Object.freeze({ ...card });
}

/** The card of a defined rule, in the shape RULE_DOCS holds: its category
 *  and its card's prose. Throws when the two do not belong together - a
 *  card for another id, or a fix note on a rule that does not fix (or none
 *  on one that does). */
export function docOf(rule, card) {
  if (!card || card.id !== rule.id) throw new Error(`rule '${rule.id}' has no card (lib/rules/${rule.id}.card.mjs, listed in lib/rules/cards.mjs)${card ? ` - got the card of '${card.id}'` : ''}`);
  if (rule.fixable !== (card.fixNote !== undefined)) {
    throw new Error(`rule '${rule.id}': ${rule.fixable ? 'it is fixable, and its card says nothing about the fix (fixNote)' : 'its card has a fixNote, and the rule is not fixable (fixable: true)'}`);
  }
  return {
    category: rule.category,
    summary: card.summary,
    detail: card.detail,
    example: card.example,
    remedy: card.remedy,
    ...(card.fixNote !== undefined ? { fixNote: card.fixNote } : {}),
  };
}

/** The published rule reference - one card per rule, generated from the
 *  cards by `scripts/generate-rules-page.mjs`. Here rather than in
 *  rule-docs.mjs (its public home, which re-exports it) so that a finding
 *  can link its rule without importing every card. */
export const RULES_PAGE = 'https://abap2ui5.github.io/linter/';

/** The card for one rule: what it means, how severe it is, how to waive it. */
export const ruleUrl = (id) => `${RULES_PAGE}#${id}`;

/** The before/after pair inside that card. A report links here rather than at
 *  the card, because the pair is the half a reader acts on. */
export const ruleExampleUrl = (id) => `${RULES_PAGE}#${id}-example`;

/**
 * Run ONE rule over a context: its findings get the rule's id as `type`, its
 * time goes under `rule:<id>` in `timings`, and what its check returns is
 * returned (unconverted-abap-boolean hands the names it found on). A rule of
 * scope 'app' is run this way, at its own place in checkAbapRules( ), with
 * exactly the context that place has.
 */
export function runRule(rule, context, { timings = null } = {}) {
  const report = (finding) => context.report({ ...finding, type: rule.id });
  if (!timings) return rule.check({ ...context, report });
  const from = performance.now();
  try {
    return rule.check({ ...context, report });
  } finally {
    timings.set(`rule:${rule.id}`, (timings.get(`rule:${rule.id}`) ?? 0) + performance.now() - from);
  }
}

/**
 * Run every rule of one scope over a context (see runRule( ) for one). Each
 * finding gets the rule's id as its `type`. With `timings` (a Map) the wall
 * time each rule took is added up under `rule:<id>`.
 */
export function runRules(rules, scope, context, { timings = null } = {}) {
  for (const rule of rules) {
    if (rule.scope !== scope) continue;
    if (rule.optIn && !context.enabled?.(rule.id)) continue;
    const report = (finding) => context.report({ ...finding, type: rule.id });
    const from = timings ? performance.now() : 0;
    rule.check({ ...context, report });
    if (timings) timings.set(`rule:${rule.id}`, (timings.get(`rule:${rule.id}`) ?? 0) + performance.now() - from);
  }
}
