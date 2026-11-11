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
  summary: 'a `mvc:View` handed to `popup_display( )`, or a `core:FragmentDefinition` to `view_display( )`',
  detail: 'The slot decides how the client builds the document: `view_display( )` and the nested variants go through `XMLView.create`, `popup_display( )` and `popover_display( )` through `Fragment.load`. A fragment is not a view, and a view has no `open( )` — so the wrong pairing fails in the browser. Only reported where the document root and the consuming call are in the same statement; a bare control root is a legitimate fragment and is never reported.',
  example: `DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\` ).
client->popup_display( popup->stringify( ) ).   " a popup slot wants a Dialog root`,
  remedy: `DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( )->ele( \`Dialog\` ).
client->popup_display( popup->stringify( ) ).`,
  message: (f) => {
    return f.value === 'mvc:View'
      ? `client->${f.member}( ) loads its XML as a fragment, but the document root is a ${f.value} — a view has no open( )`
      : `client->${f.member}( ) loads its XML as a view, but the document root is a ${f.value} — XMLView.create needs a mvc:View`;
  },
  check,
});
