import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'get-viewname-removed',
  summary: '`client->get( )-viewname` — removed from `ty_s_get`',
  detail: 'The `VIEWNAME` component was removed from `z2ui5_if_types=>ty_s_get` (it always carried an empty string), so the read **no longer compiles** — but nothing in a systemless pipeline says so before activation: abaplint has no signature knowledge of the framework interfaces, and the render gate never sees the class fail. The same blindness `popover-display-val` covers.',
  example: 'DATA(viewname) = client->get( )-viewname.   " no longer compiles',
  remedy: 'DATA(slot) = client->cs_view-main.   " name the slot yourself',
});
