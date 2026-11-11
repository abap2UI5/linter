import { defineRule } from '../rule.mjs';

function check({ code, report }) {
  /* client->get( )-viewname was REMOVED from ty_s_get (it always carried an
   * empty string). The read no longer compiles — but nothing in a systemless
   * pipeline says so before activation, the same blindness popover-display-val
   * covers. */
  for (const m of code.matchAll(/->get\s*\(\s*\)-viewname\b/gi)) {
    report({ member: 'viewname', offset: m.index });
  }
}

export default defineRule({
  id: 'get-viewname-removed',
  severity: 'error',
  category: 'lifecycle',
  scope: 'app',
  summary: '`client->get( )-viewname` — removed from `ty_s_get`',
  detail: 'The `VIEWNAME` component was removed from `z2ui5_if_types=>ty_s_get` (it always carried an empty string), so the read **no longer compiles** — but nothing in a systemless pipeline says so before activation: abaplint has no signature knowledge of the framework interfaces, and the render gate never sees the class fail. The same blindness `popover-display-val` covers.',
  example: 'DATA(viewname) = client->get( )-viewname.   " no longer compiles',
  remedy: 'DATA(slot) = client->cs_view-main.   " name the slot yourself',
  message: (f) => `client->get( )-viewname was removed from ty_s_get (it always carried an empty string) — the read no longer compiles`,
  check,
});
