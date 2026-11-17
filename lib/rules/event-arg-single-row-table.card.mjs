import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-arg-single-row-table',
  summary: '`t_arg = VALUE #( ( x ) )` for a single argument',
  detail: '`arg` is the one-value spelling of `t_arg`: the client folds `arg = x` into the same `string_table` as `t_arg = VALUE #( ( x ) )`, so the wire is byte for byte the same and the handler reads it back with the same `get_event_arg( )`. The single argument is what most wires carry — a row key, a `${$source>/…}`, one event parameter — and there the table constructor is longer than the value inside it. Not a defect; the shorter spelling is the one to teach. From two values on `t_arg` is the right parameter and this rule stays silent, as it does when both are passed (the documented composition appends `arg` behind the rows, so the call sends one more argument, not the same one). Only `client->_event( )` has the parameter — `_event_client( )` and `follow_up_action( )` are frontend actions and are never judged. A hint, and fixable. One row is left alone on purpose: a row containing a `#` (`CONV #( )`, a nested `VALUE #( )`), because `arg` is generic (`TYPE clike`) and `#` has no type to derive there — the remedy would not compile.',
  example: 'v = client->_event( val = `EDIT` t_arg = VALUE #( ( `${PRODUCT}` ) ) )',
  remedy: 'v = client->_event( val = `EDIT` arg = `${PRODUCT}` )',
  fixNote: 'The `t_arg = VALUE #( ( x ) )` span becomes `arg = x` in place. A call written over two lines collapses onto the first — the continuation kept its column, so a chain stays aligned; the padding that only existed to line `val   =` up with `t_arg =` is left as written.',
});
