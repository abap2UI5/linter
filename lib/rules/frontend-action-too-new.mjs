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
  summary: 'a `CONTROL_GLOBAL` target the target release does not carry yet',
  detail: 'Four of the global targets are resolved with a LAZY `sap.ui.require`, and deliberately so: a hard dependency on a module the running release does not have 404s and takes the whole component down with it. What that buys in robustness it pays for in silence — below its release the require returns `undefined`, the dispatch hits its "not available" guard, and the wire does nothing at all. `THEMING.setTheme` needs 1.118, `FORMATTING.setCustomCurrencies`/`addCustomCurrencies` 1.120, `INVISIBLE_MESSAGE.announce` 1.78, and `POPUP.setWithinArea` 1.89 (there the module is old and only the method is new). This is the version half of the wire family: `member-too-new` and its siblings judge what the VIEW writes, and nothing judged what the class SENDS.',
  example: `follow_up_action( val   = client->cs_event-control_global
                  t_arg = VALUE #( ( \`THEMING\` ) ( \`setTheme\` ) ( \`sap_horizon\` ) ) )   " @since 1.118`,
  remedy: `follow_up_action( val   = client->cs_event-control_global
                  t_arg = VALUE #( ( \`MESSAGE_TOAST\` ) ( \`show\` ) ( \`saved\` ) ) )`,
  message: (f) => `CONTROL_GLOBAL ${f.control}.${f.member} needs UI5 ${f.since} — below it the lazy require returns undefined, so on the ${f.minUi5} floor the dispatch hits its "not available" guard and the wire does nothing`,
  check,
});
