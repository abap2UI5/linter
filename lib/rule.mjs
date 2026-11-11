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
 *   scope      which classes it reads:
 *                'class'  every ABAP class, also one that builds no view
 *                'app'    an app class (with or without a view of its own)
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
export const SCOPES = Object.freeze(['class', 'app']);

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
 * Run the rules of one scope over a context. Each finding gets the rule's id
 * as its `type`. With `timings` (a Map) the wall time each rule took is
 * added up under its id - the only place a per-rule cost can be read at all,
 * since a rule here is a function and not a stretch of a larger one.
 */
export function runRules(rules, scope, context, { timings = null } = {}) {
  for (const rule of rules) {
    if (rule.scope !== scope) continue;
    if (rule.optIn && !context.enabled?.(rule.id)) continue;
    const report = (finding) => context.report({ ...finding, type: rule.id });
    const from = timings ? performance.now() : 0;
    rule.check({ ...context, report });
    if (timings) timings.set(rule.id, (timings.get(rule.id) ?? 0) + performance.now() - from);
  }
}
