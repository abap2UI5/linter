import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'draft-id-as-link',
  summary: 'a link or bookmark built from `client->get( )-s_draft-id` instead of `client->app_state_get_href( )`',
  detail: '`get( )-s_draft-id` is the id of the draft the current roundtrip continues, and it says nothing about how long that draft lives. abap2UI5 keeps two drafts per chain (every save deletes the one at depth three), and an unchanged timer tick writes no draft at all and answers with the id it continued - a link built from the id points at nothing two roundtrips later. The drafts the framework keeps are the ones it hands out itself: `client->app_state_get_href( )` returns the absolute, FLP-safe link to the current state and marks its draft as kept. Reported: a read of `s_draft-id` or `s_draft-id_prev` - from `<client>->get( )`, or through a variable holding `get( )` or `get( )-s_draft` - that flows, in the same method, directly or through ONE variable it is assigned to, into a string template or `&&`/`CONCATENATE` with `#`, `?`, `sap-`, `http` or a name containing url/href/link; a `follow_up_action( )` with `OPEN_NEW_TAB`, `CLIPBOARD_COPY` or `URLHELPER`; the value of an `href` or `src` attribute; or an `INSERT`/`MODIFY`/`UPDATE` of a database table (a stored bookmark). Not reported: a `MESSAGE`, a log or trace call, a message toast or box, a comparison, a pass to a method (the framework\'s `get_app( )` among them), a read in a plain literal, and any flow longer than one assignment.',
  example: `DATA(lv_link) = |{ lv_flp_url }#/z2ui5-xapp-state={ client->get( )-s_draft-id }|.
client->follow_up_action( val = client->cs_event-clipboard_copy t_arg = VALUE #( ( lv_link ) ) ).`,
  remedy: `DATA(lv_link) = client->app_state_get_href( ).
client->follow_up_action( val = client->cs_event-clipboard_copy t_arg = VALUE #( ( lv_link ) ) ).`,
});
