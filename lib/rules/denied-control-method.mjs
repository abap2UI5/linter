import { defineRule } from '../rule.mjs';
import { deniedControlMethod } from '../frontend-actions.mjs';

/* Returns whether it reported: a denied method is not judged further. */
function check({ action, args, report }) {
  /* A method the frontend denylist refuses. CONTROL_BY_ID's ALLOWED set is
   * open (any public control method), so nothing can whitelist it - but the
   * DENIED set is closed, and a wire naming one of those never reaches the
   * control: FrontendAction logs "method not allowed" and returns. That is
   * the same silence as an unknown id, and the same reason this family of
   * rules exists. The named per-aggregation mutators (removeAllItems,
   * destroyContent) are NOT denied and are never reported - only the generic
   * reflection variants that take the member name as an argument. */
  if (action !== 'control_by_id' || !args[1]?.value) return false;
  const why = deniedControlMethod(args[1].value);
  if (!why) return false;
  report({ control: 'CONTROL_BY_ID', member: why, value: args[1].value, offset: args[1].offset });
  return true;
}

export default defineRule({
  id: 'denied-control-method',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a `CONTROL_BY_ID` wire naming a method the frontend denylist refuses',
  detail: 'The wire\'s ALLOWED side is open by design — any public control method runs, so ordinary setters and toggles need no whitelist entry. The DENIED side is a closed set, and it is silent in the same way a wrong id is: `FrontendAction` logs "method not allowed" and returns, so the ABAP compiles, the view renders and the button does nothing. Denied are the methods that would break the framework\'s own invariants — teardown and reparenting (`destroy`, `exit`, `setParent`, `addDependent`, `placeAt`), model and binding swaps (`setModel`, `setBinding*`, `bind*`/`unbind*`), event-handler tampering (`attach*`/`detach*`, `fireEvent`), the render lifecycle (`rerender`, `invalidate`) and the GENERIC reflection mutators that take the member name as an argument (`addAggregation`, `removeAllAggregation`, `setAssociation`, …). The NAMED per-aggregation methods are allowed and are never reported: `removeAllItems` and `destroyContent` touch only children the control itself owns, exactly like the long-allowed `removeItem`.',
  example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`list\` ) ( \`destroy\` ) ) )`,
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`list\` ) ( \`removeAllItems\` ) ) )`,
  message: (f) => `CONTROL_BY_ID calls ${f.value}( ), which the frontend denylist refuses (${f.member === f.value ? 'a generic reflection mutator' : `it starts with '${f.member}'`}) — the dispatch logs and returns, the control is never touched`,
  check,
});
