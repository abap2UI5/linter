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
  message: (f) => {
    return `sap-icon://${f.value} is gone from the icon font again — ${
      f.since === f.lastSeen ? `it existed in ${f.since} only` : `it arrived in ${f.since} and left after ${f.lastSeen}`
    }, and renders with NO icon on every release after that`;
  },
  check,
});
