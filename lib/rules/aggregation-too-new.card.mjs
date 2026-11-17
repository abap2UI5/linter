import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'aggregation-too-new',
  summary: 'an aggregation TAG introduced after your target version',
  detail: 'The same mistake as `member-too-new`, with a far worse blast radius, which is why it is its own rule and an error. A post-floor **property** is dropped silently and the control still renders; a post-floor **aggregation** is a lowercase tag the release does not know, so UI5 falls back to resolving it as a control class and 404s on `sap/<lib>/<name>.js` — the whole view fails to load, not just the part below the tag. `<footer>` on a `sap.m.Dialog` is the recurring case: the public `footer` aggregation is ~1.110, so on 1.71 UI5 requests `sap/m/footer.js`. Use `buttons` (1.21.1); UI5 lays them out in an overflow toolbar by itself.',
  example: 'view->ele( `Dialog` )->ele( `footer` )   " @since 1.110 on a 1.71 target',
  remedy: 'view->ele( `Dialog` )->ele( `buttons` )   " in 1.71',
});
