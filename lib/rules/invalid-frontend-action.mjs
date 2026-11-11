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
  summary: 'a frontend-action `t_arg` outside the set the runtime accepts',
  detail: 'A `client->_event_client( )` / `client->follow_up_action( )` wire is dispatched in the browser by name, and a name outside the whitelist raises nothing anywhere: FrontendAction logs to the console and the control does nothing when pressed. Judged only for literal arguments and only where the runtime\'s set is closed — the `CONTROL_GLOBAL` object and its method, the `BINDING_CALL` method, and `CONTROL_BY_ID`\'s obsolete empty view slot (which shifts the method out of position). `CONTROL_BY_ID`\'s method list is open by design and is never judged. A filter-row operator that is an accepted one up to letter case (`contains` for `Contains`) carries a did-you-mean and a `--fix`, since the set is case-sensitive upstream and the miss leaves the binding unfiltered.',
  example: `client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`tab\` ) ( \`items\` ) ( \`filter\` ) ( \`[[["NAME","contains","x"]]]\` ) ) ).`,
  remedy: `client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`tab\` ) ( \`items\` ) ( \`filter\` ) ( \`[[["NAME","Contains","x"]]]\` ) ) ).`,
  fixNote: 'Only the filter-row operator, and only where the written one is an accepted operator up to letter case (`contains` for `Contains`): the token is rewritten inside the payload literal. A global object, a method or an operator no single accepted name matches that way is reported without a suggestion — `MESSAGE_TOASTER` for `MESSAGE_TOAST` is an edit, not a case miss, and the linter does not guess at those.',
  message: (f) => {
    return f.member === 'view slot'
      ? 'the empty 2nd t_arg of CONTROL_BY_ID is the obsolete view slot — the runtime inserts it now, and the empty one shifts the method out of place'
      : `${f.control}: '${f.value}' is not an accepted ${f.member} (allowed: ${[].concat(f.allowed || []).join(', ')}) — the frontend rejects the wire silently` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
