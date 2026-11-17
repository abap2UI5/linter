import { defineRule } from '../rule.mjs';
import { ACTION_ARGS, FILTER_OPERATORS } from '../frontend-actions.mjs';
import { filterGroups, parsePayload } from '../wire-readers.mjs';
import { caseMatch } from '../suggest.mjs';

/* Three places a wire's closed set is judged, by `shape`: a BINDING_CALL
 * filter operator, CONTROL_BY_ID's empty view slot (after which the wire
 * is not judged further), the argument slots ACTION_ARGS declares. */
function check({ action, args, data, shape, src, report }) {
  if (shape === 'view-slot') {
    // CONTROL_BY_ID with an EMPTY second element: that slot used to carry the
    // view and is inserted by the runtime now, so an empty one shifts the
    // method out of its position - "method '' not allowed"
    if (action !== 'control_by_id' || args[1]?.value !== '') return false;
    report({ control: 'CONTROL_BY_ID', member: 'view slot', value: '', offset: args[1].offset });
    return true;
  }
  if (shape === 'filter') {
    if (action !== 'binding_call' || args[2]?.value !== 'filter'
        || typeof args[3]?.value !== 'string' || !args[3].value.trimStart().startsWith('[')) return false;
    const groups = parsePayload(args[3].value);
    if (groups === undefined || !Array.isArray(groups)) return false;
    const { stop } = filterGroups(groups);
    if (stop?.kind !== 'operator') return false;
    const row = stop.row;
    /* The operator set is case-sensitive upstream (`contains`
     * logs and leaves the binding unfiltered where `Contains`
     * filters), so a case miss is the one did-you-mean that is
     * not a guess; the fix rewrites the operator in the payload. */
    const suggestion = caseMatch(String(row[1]), FILTER_OPERATORS);
    /* The fix rides on the finding itself, as unknown-view-slot's
     * does: the operator is found as a whole token in the payload
     * literal from the row's offset on - the same search
     * attachSuggestionFixes( ) makes, which only runs behind the
     * full pipeline, so a caller of checkAbapRules( ) alone (the
     * fixpoint gate on the rules page) sees the fix too. */
    const written = String(row[1]);
    let fixes = null;
    if (suggestion && Number.isInteger(args[3].offset)) {
      const escaped = written.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, 'g');
      re.lastIndex = args[3].offset;
      const hit = re.exec(src);
      if (hit && hit.index <= args[3].offset + 600) fixes = [{ start: hit.index, end: hit.index + written.length, text: suggestion }];
    }
    report({
      control: 'BINDING_CALL', member: 'filter operator',
      value: written.slice(0, 40), allowed: FILTER_OPERATORS, offset: args[3].offset,
      ...(suggestion ? { written, suggestion } : {}),
      ...(fixes ? { fixes } : {}),
    });
    return true;
  }
  // the closed argument slots of the actions (ACTION_ARGS)
  for (const slot of ACTION_ARGS[action] ?? []) {
    const arg = args[slot.at];
    if (!arg || arg.value === null) continue; // absent or not a literal
    const allowed = slot.allowed(args.map((a) => a?.value), data);
    if (!allowed) continue; // the earlier slot is already wrong - one finding is enough
    if (!allowed.includes(arg.value)) {
      report({ control: action.toUpperCase(), member: slot.name, value: arg.value, allowed, offset: arg.offset });
      return true;
    }
  }
  return false;
}

export default defineRule({
  id: 'invalid-frontend-action',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  fixable: true,
  message: (f) => {
    return f.member === 'view slot'
      ? 'the empty 2nd t_arg of CONTROL_BY_ID is the obsolete view slot — the runtime inserts it now, and the empty one shifts the method out of place'
      : `${f.control}: '${f.value}' is not an accepted ${f.member} (allowed: ${[].concat(f.allowed || []).join(', ')}) — the frontend rejects the wire silently` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
