import { defineRule } from '../rule.mjs';
import { GLOBAL_TARGET_SINCE } from '../frontend-actions.mjs';
import { withinUi5Floor } from '../ui5-meta.mjs';

function check({ action, args, minUi5, report }) {
  /* A CONTROL_GLOBAL target the running release does not carry. The four
   * lazily-required globals resolve to `undefined` below their release and
   * the dispatch hits its "not available" guard, so the wire is a no-op with
   * a console line — the same silence the rest of this family exists for,
   * and the version half of it that nothing judged. */
  if (action !== 'control_global' || !args[0]?.value || !args[1]?.value) return;
  const since = GLOBAL_TARGET_SINCE[`${String(args[0].value).toUpperCase()}.${args[1].value}`];
  if (since && !withinUi5Floor(since, minUi5)) {
    report({ control: String(args[0].value).toUpperCase(), member: args[1].value, since, minUi5, offset: args[1].offset });
  }
}

export default defineRule({
  id: 'frontend-action-too-new',
  severity: 'warning',
  category: 'version',
  scope: 'app',
  message: (f) => `CONTROL_GLOBAL ${f.control}.${f.member} needs UI5 ${f.since} — below it the lazy require returns undefined, so on the ${f.minUi5} floor the dispatch hits its "not available" guard and the wire does nothing`,
  check,
});
