import { defineRule } from '../rule.mjs';
import { majorMinor } from '../abap.mjs';

const parseVer = (s) => majorMinor(String(s));
const lte = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);

function check({ written, since, offset, floor, minUi5, target, report }) {
/* `since` at the data's floor means "at or before" — nothing below the
 * floor was scanned, so a target under it cannot be judged and is left
 * alone rather than guessed at. */
  const arrived = parseVer(since);
  if (!arrived || lte(arrived, floor) || lte(arrived, target)) return;
  report({ value: written, since, minUi5, offset });
}

export default defineRule({
  id: 'icon-too-new',
  severity: 'warning',
  category: 'version',
  scope: 'app',
  summary: 'an icon that reached the font after your target version',
  detail: 'The same silence as `unknown-icon`, one release boundary later: the glyph exists today and did not exist on the release you target, so the control renders without an icon there and nowhere else. `information` arrived in 1.80 (use `message-information`) and `clear-all` in 1.86 (use `eraser`) — both shipped past a green CI and were found by a user on 1.71. The registry\'s floor is 1.71, so a name already present there is recorded as "at or before" and a target below 1.71 is never judged.',
  example: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://information` )   " @since 1.80 on a 1.71 target',
  remedy: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://message-information` )   " in 1.71',
  message: (f) => `sap-icon://${f.value} reached the icon font in ${f.since} — newer than the ${f.minUi5} floor, where it renders with NO icon and nothing is logged`,
  check,
});
