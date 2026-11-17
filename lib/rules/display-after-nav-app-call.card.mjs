import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'display-after-nav-app-call',
  summary: 'a display call after `nav_app_call( )` in the same flow',
  detail: '`nav_app_call( )` hands the roundtrip to another app: what the browser shows next is THAT app\'s view. A `view_display( )` issued behind it, in the same statement sequence, builds a view nobody sees — and a `popup_display( )` behind it opens a dialog over the app being left. Nearly always a missing `RETURN` after the call. Judged on the sequence the call sits in: a display in a nested block, or after an `ELSE`/`WHEN`/`ENDIF` boundary, is another flow and is not reported.',
  example: `METHOD on_event.
  client->nav_app_call( NEW zcl_detail( id ) ).
  client->view_display( render( ) ).   " never seen
ENDMETHOD.`,
  remedy: `METHOD on_event.
  client->nav_app_call( NEW zcl_detail( id ) ).
  RETURN.
ENDMETHOD.`,
});
