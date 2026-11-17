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
  message: (f) => `CONTROL_BY_ID calls ${f.value}( ), which the frontend denylist refuses (${f.member === f.value ? 'a generic reflection mutator' : `it starts with '${f.member}'`}) — the dispatch logs and returns, the control is never touched`,
  check,
});
