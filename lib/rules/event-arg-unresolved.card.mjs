import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-arg-unresolved',
  summary: 'a bare-brace `t_arg` literal (`` `{COL}` ``)',
  detail: 'The runtime sends it verbatim, but only `$`-prefixed expressions are resolved by UI5 — so `get_event_arg( )` receives an **empty** value, with no error anywhere. Write `` `${COL}` ``. A template that starts with a `{0}` placeholder is fine: that form is quoted.',
  example: 'client->_event( val = `PICK` t_arg = VALUE #( ( `{/ID}` ) ) )   " arrives empty',
  remedy: 'client->_event( val = `PICK` t_arg = VALUE #( ( `${/ID}` ) ) )   " resolved',
  fixNote: 'The missing `$` is inserted in the literal form; a `|…|` template is left alone.',
});
