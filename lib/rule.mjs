/*
 * rule — one rule, written in one place.
 *
 * A rule used to be five entries in four files: the scan that emits it
 * (abap-rules.mjs and its siblings), its severity in SEVERITY_BY_TYPE and its
 * sentence in describe( ) (findings.mjs), its card in RULE_DOCS
 * (rule-docs.mjs), and - where it applies - its name in FIXABLE, OPT_IN and
 * SOURCE_RULES. Forgetting one of them has happened for each of them, and
 * each has a gate in the suite that exists only to catch it.
 *
 * `defineRule( )` takes all of it as one object:
 *
 *   id         the rule id - what a finding's `type` is
 *   severity   'error' | 'warning' | 'hint', before any `rules` override
 *   category   the group of the rule reference it is listed in
 *   summary, detail, example, remedy, fixNote
 *              the card: what `--explain`, the rule page and an agent read.
 *              `example` is the shortest source that triggers the rule,
 *              `remedy` the same source fixed; `fixNote` is given exactly
 *              when the rule can carry a fix
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
 * The registries the rest of the linter reads - severities, cards, the
 * fixable list - take a defined rule from here (lib/rules/index.mjs), so
 * there is nothing left to forget. Rules written before this exist in the
 * old shape and move over one at a time; both kinds are the same to a
 * consumer.
 *
 * A rule module imports leaf modules only (abap-model, abap, suggest): the
 * registries import the rules, so a rule importing findings.mjs or
 * rule-docs.mjs would be a cycle. `test/review/rule-units.mjs` holds that
 * line.
 */
export const SEVERITIES = Object.freeze(['error', 'warning', 'hint']);

/** The longest source line abapGit can import (source-line-too-long). Here,
 *  not in findings.mjs, so the rule can read it; findings.mjs re-exports it. */
export const LINE_LIMIT = 255;

/** The first `n` characters of a value as text - what a message quotes of a
 *  long literal. */
export const short = (v, n = 80) => String(v ?? '').slice(0, n);
export const SCOPES = Object.freeze(['class', 'app', 'node', 'document', 'tree']);

const REQUIRED_TEXT = ['id', 'category', 'summary', 'detail', 'example', 'remedy'];

/** Validate and freeze one rule definition. Throws on a definition that
 *  would have failed a gate later - at import, with the rule's name. */
export function defineRule(def) {
  const where = `defineRule(${def?.id ? `'${def.id}'` : '?'})`;
  if (!def || typeof def !== 'object') throw new TypeError('defineRule: expected an object');
  for (const key of REQUIRED_TEXT) {
    if (typeof def[key] !== 'string' || !def[key].trim()) throw new TypeError(`${where}: '${key}' must be a non-empty string`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(def.id)) throw new TypeError(`${where}: the id must be kebab-case`);
  if (!SEVERITIES.includes(def.severity)) throw new TypeError(`${where}: severity must be one of ${SEVERITIES.join(', ')}`);
  if (!SCOPES.includes(def.scope)) throw new TypeError(`${where}: scope must be one of ${SCOPES.join(', ')}`);
  if (typeof def.message !== 'function') throw new TypeError(`${where}: message must be a function of the finding`);
  if (typeof def.check !== 'function') throw new TypeError(`${where}: check must be a function of the context`);
  if (def.example === def.remedy) throw new TypeError(`${where}: the remedy is the example - it has to be the same source FIXED`);
  if (def.fixNote !== undefined && (typeof def.fixNote !== 'string' || !def.fixNote.trim())) {
    throw new TypeError(`${where}: fixNote, when given, must say what the fix rewrites`);
  }
  return Object.freeze({ optIn: false, ...def, fixable: def.fixNote !== undefined });
}

/** The card of a defined rule, in the shape RULE_DOCS holds. */
export function docOf(rule) {
  return {
    category: rule.category,
    summary: rule.summary,
    detail: rule.detail,
    example: rule.example,
    remedy: rule.remedy,
    ...(rule.fixNote !== undefined ? { fixNote: rule.fixNote } : {}),
  };
}

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
