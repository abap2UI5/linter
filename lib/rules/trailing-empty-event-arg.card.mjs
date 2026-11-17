import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'trailing-empty-event-arg',
  summary: 'the last `t_arg` entry is empty and never arrives',
  detail: '`get_t_arg` buffers an empty argument and flushes it only when a later non-empty one follows, so an empty entry between filled ones keeps its slot and a TRAILING one disappears. The handler\'s `get_event_arg( n )` for that position reads initial, with no error anywhere. The framework pads a missing trailing argument only for a nullable declared kind on a control method, which does not apply to a backend `_event`.',
  example: 'client->_event( val = `PICK` t_arg = VALUE #( ( `${/ID}` ) ( `` ) ) )   " get_event_arg( 2 ) reads initial',
  remedy: 'client->_event( val = `PICK` t_arg = VALUE #( ( `${/ID}` ) ) )',
  fixNote: 'The trailing empty `( \\`\\` )` row is deleted from the `VALUE #( )` constructor — it never arrives, so removing it changes nothing the handler can observe. A row with its line to itself takes the whole line; an inline row also takes the spaces in front of it. A comment is never removed with it.',
});
