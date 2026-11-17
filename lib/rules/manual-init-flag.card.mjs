import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'manual-init-flag',
  summary: 'a hand-rolled init flag instead of `client->check_on_init( )`',
  detail: 'The framework already knows whether this is the first run of the app instance — `client->check_on_init( )` is the lifecycle contract. A boolean attribute that gates the first render duplicates that knowledge as serialized state: it ships to the browser on every roundtrip for nothing, and subtle ordering bugs grow around the moment it flips. One mass migration replaced this pattern in 111 sample classes at once. Only the unambiguous shape is reported: an `IF` on the attribute being initial/false whose branch both sets it true and hands a view over — a lazy-load guard that displays nothing is left alone.',
  example: `DATA check_initialized TYPE abap_bool.
IF check_initialized = abap_false.
  check_initialized = abap_true.
  client->view_display( render( ) ).
ENDIF.`,
  remedy: `IF client->check_on_init( ).
  client->view_display( render( ) ).
ENDIF.`,
});
