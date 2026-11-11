import { defineRule } from '../rule.mjs';
import { eventDispatchRegions, handledEventSites } from '../abap-helpers.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';

function check({ code, dynamicHandling, frontendRaised, raised, src, report }) {
  /* The inverse: a handler for an event NOTHING raises - a `WHEN \`SAVE_\``
   * against a view that raises `SAVE`, or a branch left behind when the
   * control went. Dead code at best, a typo that ate a feature at worst; a
   * hint like its twin, because it never breaks a view. Judged only when the
   * two sets are both KNOWABLE: every handled name is a literal (the caution
   * above), every raise is a literal (a `_event( lv_name )` can raise
   * anything), the class raises at least one event itself (a class whose
   * whole view lives in a helper has nothing to compare against), and the
   * client handle is not handed to another object (`factory( client )` -
   * that object raises on this class's behalf). A raise the class spells in
   * another case is the case-mismatch rule's business, not this one's.
   *
   * A closing box raises too: `message_box_display( )` and
   * `message_toast_display( )` take `onclose`, "a BACKEND event name raised
   * when the box closes" (z2ui5_if_client), and the CONTROL_GLOBAL option
   * object of the same two carries it as `"onClose":"NAME"` - a literal in
   * either spelling is a raise, and its handler was reported as dead
   * (samples apps 381, 502, 512). */
  const literalRaise = /^\s*(?:val\s*=\s*)?(?:`[A-Z0-9_]+`|'[A-Z0-9_]+'|\|[A-Z0-9_]+\|)/i;
  const dynamicRaise = [...code.matchAll(/client->_event\s*\(/gi)].some((m) => {
    const { body } = parenRegion(src, m.index + m[0].length - 1);
    return body === undefined || !literalRaise.test(body);
  });
  const handsOver = /[(=]\s*(?:me->)?client\s*(?=\)|\s|$)/m.test(code);
  if (!dynamicHandling && !dynamicRaise && !handsOver && raised.size) {
    const raisedNames = new Set([...raised.keys(), ...frontendRaised.map((r) => String(r.name).toUpperCase())]);
    for (const m of code.matchAll(/client->message_(?:box|toast)_display\s*\(/gi)) {
      const { body } = parenRegion(src, m.index + m[0].length - 1);
      const onclose = namedArgMarks(body ?? '').find((a) => a.name === 'onclose')?.value.match(/^[`'|]([A-Z0-9_]+)[`'|]$/i);
      if (onclose) raisedNames.add(onclose[1].toUpperCase());
    }
    for (const m of src.matchAll(/"onClose"\s*:\s*"(\w+)"/g)) raisedNames.add(m[1].toUpperCase());
    const done = new Set();
    const dispatch = eventDispatchRegions(src);
    for (const h of handledEventSites(src)) {
      /* a WHEN names an event only in a CASE over the event - and only a
       * CASE's WHEN: `SWITCH #( range WHEN \`Phone\` THEN … )` inside a
       * handler is an expression over something else */
      if (h.when && (!dispatch.some((c) => c.owns(h.offset)) || h.then)) continue;
      const key = h.name.toUpperCase();
      if (raisedNames.has(key) || done.has(key)) continue;
      done.add(key);
      report({ value: h.name, offset: h.offset });
    }
  }
}

export default defineRule({
  id: 'handler-without-event',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a handler for an event nothing raises',
  detail: 'The inverse of `event-without-handler`: a `WHEN `X`` (or `check_on_event( `X` )`, or a comparison of the event read against a literal) whose name no `client->_event( )` in the class raises — and no keyboard shortcut, timer or `hash_attach_changed` wire, and no `onclose` of a message box or toast (the parameter, or `"onClose"` in the option object) either. A typo in one of the two names has eaten a feature, or the control went and its branch stayed. A hint, like its twin, because a view never breaks over it. Judged only when both sides are knowable: every raise and every handler is a literal, the class raises at least one event itself, and the client handle is not handed to another object (a helper that builds the view raises on this class\'s behalf). A `WHEN` counts only in a `CASE` over the event — the event read itself, a variable assigned from it, or a method parameter the class hands it to; a `CASE` over an operator or a character is not a dispatcher. A raise spelled in another case is `event-name-case-mismatch`\'s finding, not this one\'s.',
  example: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`SAVE\` ) ).
CASE client->get_event( ).
  WHEN \`SAVE_\`.   " nothing raises SAVE_
    client->message_toast_display( \`saved\` ).
ENDCASE.`,
  remedy: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`SAVE\` ) ).
CASE client->get_event( ).
  WHEN \`SAVE\`.
    client->message_toast_display( \`saved\` ).
ENDCASE.`,
  message: (f) => `the handler for ${f.value} waits for an event nothing in this class raises — a typo in one of the two names, or a dead branch`,
  check,
});
