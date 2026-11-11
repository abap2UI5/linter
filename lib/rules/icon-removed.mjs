import { defineRule } from '../rule.mjs';

/* A name a release had and a later one dropped (`data.removed`: name ->
 * the last release that still carried it). Returns whether it reported. */
function check({ written, name, since, offset, data, report }) {
  const gone = data.removed.get(name);
  if (!gone) return false;
  report({ value: written, since, lastSeen: gone, offset });
  return true;
}

export default defineRule({
  id: 'icon-removed',
  severity: 'warning',
  category: 'version',
  scope: 'app',
  summary: 'an icon that left the font again',
  detail: 'The font is nearly, but not quite, additive. `binary` was in the font for exactly one release — 1.104 — and gone again after it; the glyph is spelled `non-binary` (in the font since 1.96) everywhere else. A view written against that one release renders no icon on every release after it. Since a target version is a **floor**, the app also runs on the releases where the name is gone, which is why this is reported independently of the target.',
  example: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://binary` )   " in the font for 1.104 only',
  remedy: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://source-code` )',
  message: (f) => {
    return `sap-icon://${f.value} is gone from the icon font again — ${
      f.since === f.lastSeen ? `it existed in ${f.since} only` : `it arrived in ${f.since} and left after ${f.lastSeen}`
    }, and renders with NO icon on every release after that`;
  },
  check,
});
