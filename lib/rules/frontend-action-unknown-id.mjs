import { defineRule } from '../rule.mjs';
import { VIEW_SLOTS } from '../frontend-actions.mjs';
import { idSuggestion, staticIdOf } from '../wire-readers.mjs';

/* Called for every id-bearing argument of a wire: CONTROL_BY_ID's target
 * and its methods' id arguments (judged on the id segment), the id slots of
 * the other actions and KEYBOARD_SHORTCUT's scope (`whole`: judged on the
 * whole value, `slots`: a slot key is fine too). Returns whether it
 * reported - the wire is then not judged further where the caller says so. */
function check({ arg, control, member, viewIds, slots, whole, report }) {
  /* CONTROL_BY_ID addresses a control by the id the view gave it. A literal
   * id that no view of this class declares resolves to nothing: the
   * frontend logs "control not found" and the wire silently does nothing —
   * no exception, no failed render, and the property gate never sees the
   * ABAP side of it. Only judged when every id attribute in the class is a
   * literal (see viewIds), so a class that builds ids dynamically is left
   * alone rather than guessed at. The aggregation-item form (`id/agg/n`)
   * is judged on its id segment only. */
  const id = staticIdOf(arg?.value);
  if (!id || !viewIds) return false;
  // KEYBOARD_SHORTCUT's scope may be a slot key as well as a control id
  if (slots && VIEW_SLOTS.includes(String(arg.value).toUpperCase())) return false;
  if (viewIds.has(whole ? arg.value : id)) return false;
  report({
    control, member, value: arg.value,
    allowed: slots ? [...VIEW_SLOTS, ...[...viewIds].sort()] : [...viewIds].sort(), offset: arg.offset,
    ...idSuggestion(arg, viewIds),
  });
  return true;
}

export default defineRule({
  id: 'frontend-action-unknown-id',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  fixable: true,
  message: (f) => `${f.control} addresses '${f.value}', which no view of this class declares (known: ${[].concat(f.allowed || []).join(', ')}) — the frontend finds no control and the wire does nothing` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
