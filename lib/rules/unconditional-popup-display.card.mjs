import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unconditional-popup-display',
  summary: 'a `popup_display( )` at the top level of `main( )` — the dialog is rebuilt on every roundtrip',
  detail: '`popup_display( )` and `popover_display( )` load the fragment anew and open it every time they are called — the frontend has no "unchanged, keep it" path for a popup the way it has for the main view. A call at the top level of `main( )`, outside every branch and behind no guard, therefore runs on EVERY event the app receives: typing into a field in the dialog fires its `change`, the roundtrip rebuilds the dialog, the field loses focus, the scroll position resets. Every popup class in the framework itself displays from its `check_on_init( )` branch or behind a `RETURN` guard. Only `z2ui5_if_app~main` is judged, and only where no `RETURN`, `LEAVE`, `CHECK` or `EXIT` precedes the call — a guard block that leaves the method makes everything after it conditional.',
  example: `METHOD z2ui5_if_app~main.
  IF client->check_on_init( ).
    init( ).
  ENDIF.
  client->popup_display( render_dialog( ) ).   " every roundtrip
ENDMETHOD.`,
  remedy: `METHOD z2ui5_if_app~main.
  IF client->check_on_init( ).
    init( ).
    client->popup_display( render_dialog( ) ).   " once
  ENDIF.
ENDMETHOD.`,
});
