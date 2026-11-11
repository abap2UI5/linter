import { defineRule } from '../rule.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';

function check({ d, src, report }) {
  /* A per-keystroke event wired to a BACKEND round-trip. abap2UI5 serializes
   * round-trips: an event fired while one is in flight is DROPPED, not
   * queued, so a liveChange wire that round-trips sees the value of the last
   * COMPLETED trip and skips the ones typed in between — it converges only
   * when the input pauses. (Measured on a real port: typing `abc` with no
   * delay left the bound field at `a` while the control held `abc`.) That
   * convergence is why this is a hint, not an error: the wire is lossy, not
   * dead. Prefer a two-way binding — the model updates without any event —
   * or the control's final-value event (change/search/submit); keep the live
   * wire only when every intermediate value genuinely must reach ABAP. Only
   * the plain client->_event( ) round-trips; _event_client and
   * follow_up_action are frontend-only and are not judged. */
  /* Since the framework gained `s_ctrl-check_queue_last` (the LAST firing
   * while a roundtrip is in flight is kept and dispatched once the response
   * has landed - one roundtrip at a time, order preserved, the backend ends
   * on the control's current value) the wire has a remedy of its own, and
   * the rule reads it: a live wire carrying the flag is not lossy and is not
   * reported. The fix writes that flag - with `check_no_busy`, its documented
   * other half: the overlay a per-keystroke wire would flash over the field.
   * Every `live*` event is judged (liveChange, liveSearch, …), not one name. */
  for (const m of src.matchAll(new RegExp(`->\\s*(?:${d.att})\\s*\\(`, 'gi'))) {
    // the arguments by name, in either order; the handle may be `me->client`
    const attrOpen = m.index + m[0].length - 1;
    const marks = namedArgMarks(parenRegion(src, attrOpen).body);
    const nArg = marks.find((a) => a.name === 'n');
    const vArg = marks.find((a) => a.name === 'v');
    if (!nArg || !vArg || !/^[`'|]live\w*[`'|]$/.test(nArg.value)) continue;
    const ev = vArg.value.match(/^(?:me->)?\w*client->_event\s*\(/i);
    if (!ev) continue;
    const evOpen = attrOpen + 1 + vArg.vstart + ev[0].length - 1;
    const { body } = parenRegion(src, evOpen);
    if (body === undefined || /\bcheck_queue_last\s*=\s*abap_true\b/i.test(body)) continue;
    const evMarks = namedArgMarks(body);
    const flag = 's_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true )';
    let fixes = null;
    if (evMarks.some((a) => a.name === 's_ctrl')) fixes = null;   // a flag set some other way: the author's call
    else if (!evMarks.length && body.trim()) fixes = [{ start: evOpen + 1, end: evOpen + 1 + body.length, text: ` val = ${body.trim()} ${flag} ` }];
    else if (evMarks.length) { const at = evOpen + 1 + body.trimEnd().length; fixes = [{ start: at, end: at, text: ` ${flag}` }]; }
    report({ member: nArg.value.slice(1, -1), offset: m.index, ...(fixes ? { fixes } : {}) });
  }
}

export default defineRule({
  id: 'live-event-roundtrip',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a per-keystroke wire that round-trips without `check_queue_last`',
  detail: 'abap2UI5 serializes round-trips: an event fired while one is in flight is **dropped**, not queued. A `liveChange` (or any `live*` event) wired to `client->_event( )` therefore sees the value of the last *completed* trip and skips the ones typed in between — the bound field lags under fast input, the last keystroke included, and converges only when typing pauses. The framework\'s answer is the wire\'s own flag: `s_ctrl-check_queue_last` keeps the LAST firing while a round-trip runs and dispatches it once the response has landed — one round-trip at a time, order preserved, the backend ends on the control\'s current value; `check_no_busy` is its documented other half, keeping the full-screen overlay from flashing over the field. A wire carrying the flag is not reported. The other way out is a two-way binding plus the control\'s final-value event (`change`/`search`/`submit`). `_event_client` and `follow_up_action` are frontend-only and are not judged.',
  example: ')->a( n = `liveChange` v = client->_event( `SEARCH` ) )   " lossy under fast typing',
  remedy: ')->a( n = `liveChange` v = client->_event( val = `SEARCH` s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true ) ) )',
  fixNote: 'The `s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true )` argument is written into the `_event( )` call — a positional event name becomes `val = …` to make room for it. A call that already passes `s_ctrl` some other way keeps the finding without a fix.',
  message: (f) => `${f.member} round-trips on every keystroke, and a round-trip in flight DROPS the events behind it — under fast input the backend sits one value behind the control; set s_ctrl-check_queue_last (with check_no_busy, so the overlay stays down) to keep the last firing, or bind the value and wire the final-value event instead`,
  check,
});
