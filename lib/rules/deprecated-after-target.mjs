import { defineRule, short } from '../rule.mjs';
import { withinFloor } from '../ui5-meta.mjs';

/* Not run by the walk itself: the rule that found a deprecation between
 * the floor and the `deprecatedAt` horizon hands over what it found
 * (`finding`) and the replacement the deprecation names. */
function check({ deprecatedAt, finding, floor, minUi5, replacement, report }) {
  /* deprecated-after-target, with what it takes to act on it: the
   * replacement the deprecation names and whether the TARGET has it yet. A
   * replacement newer than the floor is the case the hint must not hide -
   * the deprecated code stays until the floor is raised. */
  report({
    minUi5, deprecatedAt, ...finding,
    ...(replacement ? {
      replacement: replacement.name,
      replacementSince: replacement.since,
      replacementAvailable: !replacement.since || withinFloor(replacement.since, floor),
    } : {}),
  });
}

export default defineRule({
  id: 'deprecated-after-target',
  severity: 'hint',
  category: 'version',
  scope: 'node',
  message: (f) => {
    const what = f.kind === 'member' ? `${f.control} ${f.member}`
      : f.kind === 'native-markup' ? `native ${f.namespace} <${f.control}>`
        : `control ${f.control}`;
    // the JSDoc link markup UI5 writes ({@link sap.m.X}, {@link #event:press press}) read as plain names
    const text = short(String((typeof f.deprecated === 'object' ? f.deprecated?.text : f.deprecated) ?? '')
      .replace(/\{@link\s+([^\s}]+)(?:\s+([^}]*?))?\s*\}/g, (m, target, label) => label || target), 70);
    const head = `${what} is deprecated since ${f.since} — after your ${f.minUi5} target, within the ${f.deprecatedAt} horizon${text ? ` (${text})` : ''}`;
    if (!f.replacement) return head;
    return f.replacementAvailable
      ? `${head}; ${f.replacement} replaces it and exists on ${f.minUi5} already`
      : `${head}; its replacement ${f.replacement} is @since ${f.replacementSince}, newer than the ${f.minUi5} floor — keep this until the floor reaches ${f.replacementSince}`;
  },
  check,
});
