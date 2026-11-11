/*
 * wire-readers - what the frontend-wire rules (lib/rules/, called from
 * checkFrontendWires( ) in lib/frontend-wires.mjs) read about a wire's
 * arguments, shared between several of them. Pure functions of the values;
 * nothing here reports. An internal module: not in the exports map.
 */
import { caseMatch } from './suggest.mjs';
import { FILTER_OPERATORS } from './frontend-actions.mjs';

/* A literal that reaches the frontend as a STATIC id, or null: a
 * $-prefixed value is resolved client-side before dispatch
 * ($event.oSource.sId, ${...} expressions) — those are exactly how a
 * sample opens a popover by whoever was pressed, and no declared-id set
 * can judge them. The aggregation-item form (`id/agg/n`) is judged on its
 * id segment. */
export const staticIdOf = (v) => {
  const s = String(v ?? '');
  if (!s || s.startsWith('$') || s.includes('{')) return null;
  return s.split('/')[0];
};

/* A JSON payload as ABAP can WRITE it.
 *
 * A |…| string template escapes its braces (`|\{ "TEL": "x" \}|`) because an
 * unescaped one opens an embedded expression — so the literal this pass
 * reads carries backslashes that the RUNTIME has already removed by the time
 * the frontend sees it. Parsing the raw text alone therefore called every
 * template-written payload malformed, which is the one spelling the corpus
 * uses most. Tried raw first, so a backtick literal (which needs no escapes)
 * is unaffected. */
export const parsePayload = (raw) => {
  for (const text of [String(raw), String(raw).replace(/\\([{}|])/g, '$1')]) {
    try { return JSON.parse(text); } catch { /* try the de-escaped form */ }
  }
  return undefined;
};

/* did you mean, for an id no view declares: the one declared id this is
 * up to case (`messageview` for `messageView`), rewritten inside the
 * literal's own span — literalElements carries it for exactly this. */
export const idSuggestion = (arg, ids) => {
  const suggestion = caseMatch(String(arg.value), ids);
  if (!suggestion) return {};
  const fix = arg.litStart != null
    ? { fixes: [{ start: arg.litStart + 1, end: arg.litEnd - 1, text: suggestion }] }
    : {};
  return { written: String(arg.value), suggestion, ...fix };
};

/* The compound filter payload of BINDING_CALL `filter`: ONE JSON param of
 * groups, each group rows of [path, operator, value1, value2]. The groups
 * buildFilterGroups keeps (an array with rows), and the FIRST row it stops
 * at - either not a row at all (`shape`) or a row whose operator is off the
 * whitelist (`operator`). Upstream logs the first one and leaves the binding
 * untouched, which is why only the first is judged: invalid-action-payload
 * takes a `shape` stop, invalid-frontend-action an `operator` one. */
export function filterGroups(groups) {
  const usable = groups.filter((g) => Array.isArray(g) && g.length);
  for (const group of usable) {
    for (const row of group) {
      if (!Array.isArray(row) || typeof row[0] !== 'string') return { usable, stop: { kind: 'shape', row } };
      if (!FILTER_OPERATORS.includes(row[1])) return { usable, stop: { kind: 'operator', row } };
    }
  }
  return { usable, stop: null };
}
