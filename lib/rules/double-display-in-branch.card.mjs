import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'double-display-in-branch',
  summary: 'the same slot displayed twice in one flow — the first call is dead',
  detail: 'Two `view_display( )` calls in the same statement sequence — or two `popup_display( )`, two `nest_view_display( )` — hand the frontend two documents for one slot in one roundtrip, and only the last one is ever shown. The first is dead code, and the view it built is usually a different one: the shape is a display left behind after a refactoring, or a fallthrough display under a `CASE` whose branches already display. A display inside a nested block counts as its own flow and is not paired with one outside it.',
  example: `METHOD main.
  client->view_display( render_list( ) ).   " replaced before it is seen
  client->view_display( render_detail( ) ).
ENDMETHOD.`,
  remedy: `METHOD main.
  client->view_display( render_detail( ) ).
ENDMETHOD.`,
});
