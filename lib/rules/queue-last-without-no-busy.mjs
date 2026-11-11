import { defineRule } from '../rule.mjs';
import { isLiveEvent } from '../abap-source.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';

function check({ src, d, report }) {

  /* The other half of a per-keystroke wire. `check_queue_last` keeps the
   * keystrokes from being lost (live-event-roundtrip's remedy), and on its
   * own it leaves the OVERLAY: the first roundtrip raises the busy indicator
   * after the usual delay, and every keystroke that lands on a roundtrip
   * already in flight raises it with no delay at all, because a dropped
   * click needs that feedback at once - so a live search flashes the overlay
   * over the very field being typed into from the second character on. The
   * interface: "Pair it with check_queue_last: nothing is lost and nothing
   * blinks." The guide (§5): "without it every keystroke landing on a
   * roundtrip in flight raises the overlay at once, over the very field being
   * typed into." Read the way live-event-roundtrip reads the wire - the
   * `n =`/`v =` of an attribute call, the plain client->_event( ) only - and
   * judged on the `s_ctrl = VALUE …( )` the call already carries; the fix
   * writes the missing flag into that constructor. */
  for (const m of src.matchAll(new RegExp(`->\\s*(?:${d.att})\\s*\\(`, 'gi'))) {
    const attrOpen = m.index + m[0].length - 1;
    const marks = namedArgMarks(parenRegion(src, attrOpen).body);
    const nArg = marks.find((a) => a.name === 'n');
    const vArg = marks.find((a) => a.name === 'v');
    if (!nArg || !vArg) continue;
    const name = nArg.value.match(/^[`'|](\w+)[`'|]$/);
    if (!name || !isLiveEvent(name[1])) continue;
    const ev = vArg.value.match(/^(?:me->)?\w*client->_event\s*\(/i);
    if (!ev) continue;
    const evOpen = attrOpen + 1 + vArg.vstart + ev[0].length - 1;
    const { body } = parenRegion(src, evOpen);
    if (body === undefined) continue;
    const ctrl = namedArgMarks(body).find((a) => a.name === 's_ctrl');
    const ctor = ctrl?.value.match(/^VALUE\s+(?:#|[\w=>]+)\s*\(/i);
    if (!ctor) continue;
    const inner = parenRegion(ctrl.value, ctor[0].length - 1).body;
    if (!/\bcheck_queue_last\s*=\s*abap_true\b/i.test(inner) || /\bcheck_no_busy\b/i.test(inner)) continue;
    const at = evOpen + 1 + ctrl.vstart + ctor[0].length + inner.trimEnd().length;
    report({
      member: name[1], offset: m.index,
      fixes: [{ start: at, end: at, text: ' check_no_busy = abap_true' }],
    });
  }
}

export default defineRule({
  id: 'queue-last-without-no-busy',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a per-keystroke wire with `check_queue_last` and no `check_no_busy`',
  detail: '`check_queue_last` is one half of a per-keystroke wire — it keeps the LAST firing while a roundtrip is in flight instead of dropping it, which is what `live-event-roundtrip` asks for. The other half is the overlay: the first roundtrip raises the global busy indicator after the usual delay, and every keystroke that lands on a roundtrip already in flight raises it with NO delay, because a dropped click needs that feedback at once. Typing is the opposite case — the user is looking at the field, not waiting for a screen — so, in the guide\'s words (§5), "without it every keystroke landing on a roundtrip in flight raises the overlay at once, over the very field being typed into". `check_no_busy` keeps that overlay down for the one wire (the roundtrip, the busy state and the guard are unchanged), and the interface\'s own ABAP Doc says how the two go together: "Pair it with check_queue_last: nothing is lost and nothing blinks." Read the way `live-event-roundtrip` reads the wire — a `live*` event whose `v =` is the plain `client->_event( )` — and judged on the `s_ctrl = VALUE #( … )` the call already carries. A hint: nothing is lost, the field blinks.',
  example: ')->a( n = `liveChange` v = client->_event( val = `SEARCH` s_ctrl = VALUE #( check_queue_last = abap_true ) ) )   " the overlay flashes over the field',
  remedy: ')->a( n = `liveChange` v = client->_event( val = `SEARCH` s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true ) ) )',
  fixNote: '`check_no_busy = abap_true` is appended inside the existing `s_ctrl = VALUE #( … )` constructor, after the fields it already sets.',
  message: (f) => `${f.member} queues its last firing with check_queue_last, but without check_no_busy every keystroke landing on a roundtrip in flight raises the busy overlay at once, over the very field being typed into — add check_no_busy = abap_true to the same s_ctrl`,
  check,
});
