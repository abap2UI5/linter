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
  message: (f) => `sap-icon://${f.value} reached the icon font in ${f.since} — newer than the ${f.minUi5} floor, where it renders with NO icon and nothing is logged`,
  check,
});
