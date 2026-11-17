import { defineRule } from '../rule.mjs';

function check({ attr, branches, data, decl, full, node, report }) {
  /* A `COND #( )` / `SWITCH #( )` whose branches are literals but which has
   * no ELSE: when no WHEN matches it yields the initial value, "", and an
   * enum-typed property refuses "" - the render gate shows it as
   * `Value '' is not valid for type …`, and the view is never created.
   * The literal branches themselves are judged by invalid-property-value as
   * before; this names the branch that is not written. A warning: whether
   * some WHEN always matches is a runtime matter. */
  if (!branches.noElse || !decl?.type) return;
  const values = (data.__enums || {})[decl.type];
  if (!values || values.includes('')) return;
  report({ control: full, member: attr, memberType: decl.type, offset: branches.offset ?? node.offset ?? 0 });
}

export default defineRule({
  id: 'enum-cond-without-else',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} is a COND #( )/SWITCH #( ) with no ELSE — when no WHEN matches it yields "", which is no ${f.memberType}, and the view is not created; add an ELSE with a valid value`,
  check,
});
