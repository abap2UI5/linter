import { defineRule } from '../rule.mjs';
import { knownControl, memberNames } from '../ui5-meta.mjs';
import { caseMatch } from '../suggest.mjs';

/* Legitimately absent from the snapshot: the view/fragment document roots,
 * and CustomData, which UI5 creates dynamically
 * (Element.getMetadata().getAggregation("customData").defaultClass) rather
 * than with an .extend() the generator could read. */
const BUILTIN = new Set([
  'sap.ui.core.mvc.View', 'sap.ui.core.FragmentDefinition', 'sap.ui.core.CustomData',
]);

function check({ node, full, data, knownLibs, ownerControl, report }) {
  if (!full || knownControl(data, full) || BUILTIN.has(full)
      || !knownLibs.has(full.slice(0, full.lastIndexOf('.')))) return;
  // a typo'd control in a UI5 library the snapshot covers - the most
  // common generation error, worth failing fast without a browser
  /* did you mean: the one control of the SAME library that is this
   * name up to case — `button` for `Button`. Same library only, so the
   * local name the source writes is what the fix rewrites. */
  const lib = full.slice(0, full.lastIndexOf('.'));
  const local = full.slice(lib.length + 1);
  /* …or the one AGGREGATION of the owning control it is up to case:
   * in UI5 XML the first letter decides — `Content` is a control that
   * does not exist, `content` the aggregation that was meant. */
  const ownerAggs = ownerControl && knownControl(data, ownerControl.control)
    ? memberNames(data, ownerControl.control, ['aggregations', 'associations']) : [];
  const suggestion = caseMatch(local, [...Object.keys(data)
    .filter((k) => k.startsWith(`${lib}.`) && !k.slice(lib.length + 1).includes('.'))
    .map((k) => k.slice(lib.length + 1)), ...ownerAggs]);
  report({
    control: full, offset: node.offset,
    ...(suggestion ? { written: local, suggestion } : {}),
  });
}

export default defineRule({
  id: 'unknown-control',
  severity: 'error',
  category: 'metadata',
  scope: 'node',
  summary: '`sap.m.Shell2` — no such control',
  detail: 'The control name is not in the metadata snapshot under any known library. Almost always a typo; UI5 fails to load the class and the view never appears. A control from a custom namespace is out of scope and never reported here.',
  example: 'view->tag( `Objectstatus` )',
  remedy: 'view->tag( `ObjectStatus` )',
  fixNote: 'Where exactly one control of the same library is the written name up to letter case — or one aggregation of the owning control is, since in UI5 XML the first letter decides between the two — the finding names it and `--fix` rewrites the name in the builder call (or the XML tag). A name no single candidate matches that way is reported without a suggestion; the linter does not guess at edit distances.',
  message: (f) => `control ${f.control} does not exist in UI5 — typo?` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
