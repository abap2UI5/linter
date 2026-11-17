import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-arg-default-index',
  summary: '`get_event_arg( 1 )` spells out the default',
  detail: 'The parameter is `v TYPE i DEFAULT 1`, so `get_event_arg( )` reads the same first argument. Not a defect — the call is correct — but the explicit index reads as if the position mattered, and the shortest notation is the ecosystem\'s. Pass an index from the second argument on. A hint, and fixable: the argument is deleted, whichever of its two spellings (`1`, `v = 1`) it has.',
  example: 'mv_id = client->get_event_arg( 1 ).',
  remedy: 'mv_id = client->get_event_arg( ).',
  fixNote: 'The argument is deleted — `get_event_arg( 1 )` and `get_event_arg( v = 1 )` both become `get_event_arg( )`.',
});
