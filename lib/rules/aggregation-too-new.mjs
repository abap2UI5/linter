import { defineRule } from '../rule.mjs';
import { sinceOf, withinFloor } from '../ui5-meta.mjs';

/* Returns whether it reported: a tag too new for the floor is not judged
 * as unknown on top (unknown-aggregation runs only when this did not). */
function check({ node, parent, data, floor, minUi5, report }) {
  const since = sinceOf(data, parent, node.name);
  if (!since || withinFloor(since, floor)) return false;
  /* An aggregation TAG, not an attribute — and that difference is the
   * whole blast radius. A post-floor property is dropped silently and
   * the control still renders; a post-floor aggregation makes UI5
   * resolve the lowercase tag as a CONTROL CLASS, and the 404 on
   * sap/<lib>/<name>.js takes the whole view down. `<footer>` on a
   * sap.m.Dialog is the case that keeps happening: public since ~1.110,
   * so on 1.71 the view does not load at all. Use `buttons` (1.21.1),
   * which UI5 lays out in an overflow toolbar by itself. */
  report({ control: parent, member: node.name, since, minUi5, offset: node.offset });
  return true;
}

export default defineRule({
  id: 'aggregation-too-new',
  severity: 'error',
  category: 'version',
  scope: 'node',
  message: (f) => `${f.control} has no aggregation ${f.member} before ${f.since} — on the ${f.minUi5} floor UI5 resolves the tag as a control class instead and the 404 takes the WHOLE view down, not just this part`,
  check,
});
