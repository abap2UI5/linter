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
  summary: 'a `COND #( )` without ELSE on an enum-typed attribute — "" when no WHEN matches, and the view is not created',
  detail: 'A conditional with no `ELSE` yields the initial value of its type when no `WHEN` matches — the empty string for every value a view attribute takes. An enum-typed property refuses `""`: the XML view fails to load with `Value \'\' is not valid for type …` (confirmed by the render gate), whether the control is visible or not. Each literal branch is still judged on its own (`invalid-property-value`); this names the branch that is missing. A warning, because a condition that always matches one `WHEN` is a runtime matter this source does not show. Write the `ELSE` with the enum\'s default, or bind the property to an attribute that always holds a valid value.',
  example: 'view->tag( `MessageStrip` )->a( n = `type` v = COND #( WHEN lv_failed = abap_true THEN `Error` ) )',
  remedy: 'view->tag( `MessageStrip` )->a( n = `type` v = COND #( WHEN lv_failed = abap_true THEN `Error` ELSE `Information` ) )',
  message: (f) => `${f.control} ${f.member} is a COND #( )/SWITCH #( ) with no ELSE — when no WHEN matches it yields "", which is no ${f.memberType}, and the view is not created; add an ELSE with a valid value`,
  check,
});
