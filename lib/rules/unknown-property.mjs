import { defineRule } from '../rule.mjs';
import { chainComplete, memberNames, snapshotHint } from '../ui5-meta.mjs';
import { caseMatch } from '../suggest.mjs';

/* Called for an attribute no member of the control's chain has; judged
 * only when the chain is complete in the snapshot. */
/* The settings XMLView reads off its own root element before any managed
 * property is applied (sap/ui/core/mvc/XMLView.js: `controllerName`, the
 * resource-bundle attributes) - attributes of the view DECLARATION, not
 * members of the control, so the metadata never lists them. */
const VIEW_ROOT_SETTINGS = new Set(['controllerName', 'resourceBundleName', 'resourceBundleUrl', 'resourceBundleLocale', 'resourceBundleAlias']);

function check({ attr, data, full, offset, report }) {
  if (!chainComplete(data, full)) return;
  if (VIEW_ROOT_SETTINGS.has(attr) && (full === 'sap.ui.core.mvc.View' || full === 'sap.ui.core.mvc.XMLView')) return;
  const suggestion = caseMatch(attr, memberNames(data, full, ['properties', 'events', 'associations', 'aggregations']));
  report({
    control: full, member: attr, snapshot: data.__ui5Version, offset,
    ...(suggestion ? { written: attr, suggestion } : {}),
  });
}

export default defineRule({
  id: 'unknown-property',
  severity: 'error',
  category: 'metadata',
  scope: 'node',
  fixable: true,
  message: (f) => `${f.control} has no property/event/association ${f.member} — typo?${snapshotHint(f)}` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
