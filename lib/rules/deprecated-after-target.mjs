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
  summary: 'deprecated after your target version, within the deprecation horizon you set',
  detail: 'Reported only when the config sets a deprecation horizon (`"deprecatedAt": "1.136"`, `--deprecated-at 1.136`), and only for what took effect AFTER the target (`ui5`) and up to the horizon — what is deprecated at the target already is `control-deprecated` / `member-deprecated`, and every other rule keeps judging against the target. It answers the question the target cannot: an abap2UI5 app held to 1.71 so that it runs on old systems is still meant to be legacy-free code, and SAP measures that against 1.136, the baseline its own UI5 linter, the UI5 Modernization Plugin and the 2.x migration all target — none of which ever see a view built in ABAP. Controls, their properties and events, and native XHTML/SVG markup (deprecated in an XML view since 1.120) are judged. When the deprecation names a replacement the snapshot knows (`{@link sap.m.IllustratedMessage}`, `{@link #event:press}`), the finding says whether the target already has it: often it does not — `sap.m.MessagePage` (deprecated 1.112) is replaced by `IllustratedMessage`, which needs 1.98 — and then the deprecated control is the right code until the target moves, which is why this is a hint. Never fixed automatically: rewriting to a replacement the target lacks would break exactly the systems the target protects.',
  example: 'view->tag( `MessagePage` )   " deprecated since 1.112 - judged with ui5 1.71, deprecatedAt 1.136',
  remedy: 'view->tag( `IllustratedMessage` )   " once the target reaches 1.98',
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
