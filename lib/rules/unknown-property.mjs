import { defineRule } from '../rule.mjs';
import { chainComplete, memberNames, snapshotHint } from '../ui5-meta.mjs';
import { caseMatch } from '../suggest.mjs';

/* Called for an attribute no member of the control's chain has; judged
 * only when the chain is complete in the snapshot. */
function check({ attr, data, full, offset, report }) {
  if (!chainComplete(data, full)) return;
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
  summary: '`Button typ="…"` — no such property, event or association',
  detail: 'The attribute does not exist on the control or anywhere in its inheritance chain. UI5 in future mode rejects the view. A control whose chain leaves the snapshot is never reported as missing a member — the linter does not guess. One caveat the message now carries: the metadata snapshot is a PIN, so a member released AFTER it is absent here and reports in exactly the shape a typo has. That verdict cannot be split without demoting every real typo with it, so the way out is the `allow` list, which suppresses any finding on one named `Control.member` — `"allow": ["sap.ui.unified.DateTypeRange.ariaHasPopup"]` — rather than switching the rule off for a whole repository.',
  example: 'view->tag( `Button` )->a( n = `typ` v = `Emphasized` )',
  remedy: 'view->tag( `Button` )->a( n = `type` v = `Emphasized` )',
  fixNote: 'Where exactly one property, event, association or aggregation of the control (its parents included) is the written name up to letter case and separators, the finding names it and `--fix` rewrites the attribute name in place. Anything less exact than that is reported without a suggestion.',
  message: (f) => `${f.control} has no property/event/association ${f.member} — typo?${snapshotHint(f)}` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
