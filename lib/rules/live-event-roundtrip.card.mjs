import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'live-event-roundtrip',
  summary: 'a per-keystroke wire that round-trips without `check_queue_last`',
  detail: 'abap2UI5 serializes round-trips: an event fired while one is in flight is **dropped**, not queued. A `liveChange` (or any `live*` event) wired to `client->_event( )` therefore sees the value of the last *completed* trip and skips the ones typed in between — the bound field lags under fast input, the last keystroke included, and converges only when typing pauses. The framework\'s answer is the wire\'s own flag: `s_ctrl-check_queue_last` keeps the LAST firing while a round-trip runs and dispatches it once the response has landed — one round-trip at a time, order preserved, the backend ends on the control\'s current value; `check_no_busy` is its documented other half, keeping the full-screen overlay from flashing over the field. A wire carrying the flag is not reported. The other way out is a two-way binding plus the control\'s final-value event (`change`/`search`/`submit`). `_event_client` and `follow_up_action` are frontend-only and are not judged.',
  example: ')->a( n = `liveChange` v = client->_event( `SEARCH` ) )   " lossy under fast typing',
  remedy: ')->a( n = `liveChange` v = client->_event( val = `SEARCH` s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true ) ) )',
  fixNote: 'The `s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true )` argument is written into the `_event( )` call — a positional event name becomes `val = …` to make room for it. A call that already passes `s_ctrl` some other way keeps the finding without a fix.',
});
