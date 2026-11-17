import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'popup-without-close-wire',
  summary: 'a `Dialog` built without a single event wire — nothing can close it',
  detail: 'A `sap.m.Dialog` shown through `popup_display( )` has no close affordance of its own: no button, no close icon. The app closes it — `popup_destroy( )` or a new display from the branch that handles a button\'s `press`, an `afterClose` or an `escapeHandler` — and all of those are event wires. A method that builds a `Dialog` root and wires NO event anywhere in it (no `_event( )`, no `_event_client( )`, no `follow_up_action( )`) has left the dialog with Escape as its only exit, and the app never hears about that. Judged per METHOD, because a dialog\'s buttons are often chained in a second statement on the same handle; a method that hands the buttons to a helper is the shape this cannot see, which is why it is a hint.',
  example: `METHOD render_dialog.
  DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( ).
  popup->ele( \`Dialog\` )->a( n = \`title\` v = \`Hi\` )->tag( \`Text\` )->a( n = \`text\` v = \`hello\` ).
  result = popup->stringify( ).
ENDMETHOD.`,
  remedy: `METHOD render_dialog.
  DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( ).
  popup->ele( \`Dialog\`
      )->a( n = \`title\` v = \`Hi\`
      )->tag( \`Text\`
          )->a( n = \`text\` v = \`hello\`
      )->ele( \`buttons\`
          )->tag( \`Button\`
              )->a( n = \`text\`  v = \`Close\`
              )->a( n = \`press\` v = client->_event( \`CLOSE\` ) ).
  result = popup->stringify( ).
ENDMETHOD.`,
});
