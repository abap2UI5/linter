import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'frontend-action-too-new',
  summary: 'a `CONTROL_GLOBAL` target the target release does not carry yet',
  detail: 'Four of the global targets are resolved with a LAZY `sap.ui.require`, and deliberately so: a hard dependency on a module the running release does not have 404s and takes the whole component down with it. What that buys in robustness it pays for in silence — below its release the require returns `undefined`, the dispatch hits its "not available" guard, and the wire does nothing at all. `THEMING.setTheme` needs 1.118, `FORMATTING.setCustomCurrencies`/`addCustomCurrencies` 1.120, `INVISIBLE_MESSAGE.announce` 1.78, and `POPUP.setWithinArea` 1.89 (there the module is old and only the method is new). This is the version half of the wire family: `member-too-new` and its siblings judge what the VIEW writes, and nothing judged what the class SENDS.',
  example: `follow_up_action( val   = client->cs_event-control_global
                  t_arg = VALUE #( ( \`THEMING\` ) ( \`setTheme\` ) ( \`sap_horizon\` ) ) )   " @since 1.118`,
  remedy: `follow_up_action( val   = client->cs_event-control_global
                  t_arg = VALUE #( ( \`MESSAGE_TOAST\` ) ( \`show\` ) ( \`saved\` ) ) )`,
});
