import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'invalid-action-payload',
  summary: 'a JSON action payload the runtime silently downgrades',
  detail: 'The `object`-kind control methods (`setSticky`, `setHiddenInPopin`, `setP13nData`) run their argument through `castArg`, whose catch turns a literal that does not parse as JSON into `{}` — a `setSticky` with a typo\'d payload then *un-sticks* everything instead of failing. For the enum-array payloads the values are judged too: an unknown `sap.m.Sticky` / `sap.ui.core.Priority` key is dropped by UI5 with the same silence. `BINDING_CALL`\'s compound filter-groups JSON is judged the same way, including each row\'s operator.',
  example: 't_arg = VALUE #( ( `table1` ) ( `setSticky` ) ( `ColumnHeaders` ) )   " not JSON -> {}',
  remedy: 't_arg = VALUE #( ( `table1` ) ( `setSticky` ) ( `["ColumnHeaders"]` ) )',
});
