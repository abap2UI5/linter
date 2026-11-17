import { defineRule } from '../rule.mjs';
import { withinFloor, NATIVE_MARKUP_DEPRECATED } from '../ui5-meta.mjs';

/* Called on every tag of a native-markup namespace (`markup` is XHTML or
 * SVG); judged on the OUTERMOST of an island only - the walk marks the
 * children `insideNative` after the call. */
function check({ node, markup, floor, horizon, data, insideNative, prefixOf, localName, reportAfterTarget, report }) {
  if (insideNative.has(node)) return;
  const native = {
    control: `${prefixOf(node) ? `${prefixOf(node)}:` : ''}${localName(node)}`,
    namespace: markup, since: NATIVE_MARKUP_DEPRECATED, offset: node.offset,
  };
  if (withinFloor(NATIVE_MARKUP_DEPRECATED, floor)) {
    report({ ...native });
  } else if (horizon && withinFloor(NATIVE_MARKUP_DEPRECATED, horizon)) {
    reportAfterTarget({ kind: 'native-markup', ...native },
      { name: 'sap.ui.core.HTML', since: data['sap.ui.core.HTML']?.since ?? null });
  }
}

export default defineRule({
  id: 'native-html-in-view',
  severity: 'hint',
  category: 'version',
  scope: 'node',
  message: (f) => `<${f.control}> is native ${f.namespace} in the view — deprecated since UI5 ${f.since}, logged as a [FUTURE FATAL] and refused by the next major release; use a sap.ui.core.HTML control (content="…") or a UI5 control`,
  check,
});
