import { defineRule } from '../rule.mjs';

/* Called by the reconstructor where a document is handed to a display
 * call (`consumer`), once it knows whether that call loads a fragment. */
function check({ root, consumer, wantsFragment, offset, report }) {
  const rootEl = root.children[0];
  if (!rootEl) return;
  const isFragment = rootEl.name === 'FragmentDefinition';
  const isView = rootEl.name === 'View' && rootEl.ns === 'mvc';
  // only the two unambiguous directions - a bare control root is a legitimate
  // fragment and is never reported
  if (wantsFragment && isView) {
    report({ member: consumer, value: 'mvc:View', offset });
  } else if (!wantsFragment && isFragment) {
    report({ member: consumer, value: 'core:FragmentDefinition', offset });
  }
}

export default defineRule({
  id: 'display-root-mismatch',
  severity: 'error',
  category: 'structure',
  scope: 'tree',
  message: (f) => {
    return f.value === 'mvc:View'
      ? `client->${f.member}( ) loads its XML as a fragment, but the document root is a ${f.value} — a view has no open( )`
      : `client->${f.member}( ) loads its XML as a view, but the document root is a ${f.value} — XMLView.create needs a mvc:View`;
  },
  check,
});
