import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'queue-last-without-no-busy',
  summary: 'a per-keystroke wire with `check_queue_last` and no `check_no_busy`',
  detail: '`check_queue_last` is one half of a per-keystroke wire — it keeps the LAST firing while a roundtrip is in flight instead of dropping it, which is what `live-event-roundtrip` asks for. The other half is the overlay: the first roundtrip raises the global busy indicator after the usual delay, and every keystroke that lands on a roundtrip already in flight raises it with NO delay, because a dropped click needs that feedback at once. Typing is the opposite case — the user is looking at the field, not waiting for a screen — so, in the guide\'s words (§5), "without it every keystroke landing on a roundtrip in flight raises the overlay at once, over the very field being typed into". `check_no_busy` keeps that overlay down for the one wire (the roundtrip, the busy state and the guard are unchanged), and the interface\'s own ABAP Doc says how the two go together: "Pair it with check_queue_last: nothing is lost and nothing blinks." Read the way `live-event-roundtrip` reads the wire — a `live*` event whose `v =` is the plain `client->_event( )` — and judged on the `s_ctrl = VALUE #( … )` the call already carries. A hint: nothing is lost, the field blinks.',
  example: ')->a( n = `liveChange` v = client->_event( val = `SEARCH` s_ctrl = VALUE #( check_queue_last = abap_true ) ) )   " the overlay flashes over the field',
  remedy: ')->a( n = `liveChange` v = client->_event( val = `SEARCH` s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true ) ) )',
  fixNote: '`check_no_busy = abap_true` is appended inside the existing `s_ctrl = VALUE #( … )` constructor, after the fields it already sets.',
});
