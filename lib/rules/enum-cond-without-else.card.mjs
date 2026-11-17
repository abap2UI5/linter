import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'enum-cond-without-else',
  summary: 'a `COND #( )` without ELSE on an enum-typed attribute — "" when no WHEN matches, and the view is not created',
  detail: 'A conditional with no `ELSE` yields the initial value of its type when no `WHEN` matches — the empty string for every value a view attribute takes. An enum-typed property refuses `""`: the XML view fails to load with `Value \'\' is not valid for type …` (confirmed by the render gate), whether the control is visible or not. Each literal branch is still judged on its own (`invalid-property-value`); this names the branch that is missing. A warning, because a condition that always matches one `WHEN` is a runtime matter this source does not show. Write the `ELSE` with the enum\'s default, or bind the property to an attribute that always holds a valid value.',
  example: 'view->tag( `MessageStrip` )->a( n = `type` v = COND #( WHEN lv_failed = abap_true THEN `Error` ) )',
  remedy: 'view->tag( `MessageStrip` )->a( n = `type` v = COND #( WHEN lv_failed = abap_true THEN `Error` ELSE `Information` ) )',
});
