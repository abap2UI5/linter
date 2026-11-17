import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'frontend-action-as-backend-event',
  summary: 'a `cs_event-` constant raised through `client->_event( )`',
  detail: 'The `cs_event-` constants name FRONTEND actions — `popup_close` tears the popup slot down in the browser, without a roundtrip — and `follow_up_action( )` is the wire that sends one. `_event( )` is the BACKEND wire: whatever it is given becomes the event name of a roundtrip. So a constant passed to it is, in the guide\'s words (§6), "a backend event named `POPUP_CLOSE` like any other, it reaches `main( )` and closes nothing by itself" — the roundtrip runs, falls through every `WHEN`, and the dialog stays. Nothing else can see it: `event-without-handler` judges literal names only, and this one is a constant. Any spelling of the constant is reported (`client->cs_event-…`, `z2ui5_if_client=>cs_event-…`, with or without `val =`) — except a `cs_event` of the class\'s own: where the class declares one, or inherits one from a superclass (resolved through the other linted files; a superclass the run does not have is read as declaring one), the bare `cs_event-…` and `me->cs_event-…` are that constant, a backend event name, and only a spelling through a client reference is judged. A class-qualified `<class>=>cs_event-…` is that class\'s constant and reported only when the class is `z2ui5_if_client`; a literal `_event( \\`POPUP_CLOSE\\` )` is a backend event by declaration and is left to the handler rules.',
  example: ')->a( n = `press` v = client->_event( client->cs_event-popup_close ) )   " a roundtrip, and the popup stays',
  remedy: ')->a( n = `press` v = client->follow_up_action( val = client->cs_event-popup_close ) )',
  fixNote: 'The call is renamed to `client->follow_up_action( )`, whose first parameter is the same `val`; a positional constant is given its `val =` on the way. The argument itself is untouched.',
});
