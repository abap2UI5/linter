import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'denied-control-method',
  summary: 'a `CONTROL_BY_ID` wire naming a method the frontend denylist refuses',
  detail: 'The wire\'s ALLOWED side is open by design — any public control method runs, so ordinary setters and toggles need no whitelist entry. The DENIED side is a closed set, and it is silent in the same way a wrong id is: `FrontendAction` logs "method not allowed" and returns, so the ABAP compiles, the view renders and the button does nothing. Denied are the methods that would break the framework\'s own invariants — teardown and reparenting (`destroy`, `exit`, `setParent`, `addDependent`, `placeAt`), model and binding swaps (`setModel`, `setBinding*`, `bind*`/`unbind*`), event-handler tampering (`attach*`/`detach*`, `fireEvent`), the render lifecycle (`rerender`, `invalidate`) and the GENERIC reflection mutators that take the member name as an argument (`addAggregation`, `removeAllAggregation`, `setAssociation`, …). The NAMED per-aggregation methods are allowed and are never reported: `removeAllItems` and `destroyContent` touch only children the control itself owns, exactly like the long-allowed `removeItem`.',
  example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`list\` ) ( \`destroy\` ) ) )`,
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`list\` ) ( \`removeAllItems\` ) ) )`,
});
