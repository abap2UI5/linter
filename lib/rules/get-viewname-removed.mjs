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
  message: (f) => `client->get( )-viewname was removed from ty_s_get (it always carried an empty string) — the read no longer compiles`,
  check,
});
