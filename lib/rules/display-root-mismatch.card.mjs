import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'display-root-mismatch',
  summary: 'a `mvc:View` handed to `popup_display( )`, or a `core:FragmentDefinition` to `view_display( )`',
  detail: 'The slot decides how the client builds the document: `view_display( )` and the nested variants go through `XMLView.create`, `popup_display( )` and `popover_display( )` through `Fragment.load`. A fragment is not a view, and a view has no `open( )` — so the wrong pairing fails in the browser. Only reported where the document root and the consuming call are in the same statement; a bare control root is a legitimate fragment and is never reported.',
  example: `DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\` ).
client->popup_display( popup->stringify( ) ).   " a popup slot wants a Dialog root`,
  remedy: `DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( )->ele( \`Dialog\` ).
client->popup_display( popup->stringify( ) ).`,
});
