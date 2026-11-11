import { defineRule } from '../rule.mjs';
import { handledEventLiterals, raisedEventLiterals } from '../abap-helpers.mjs';

function check({ src, report }) {
  /* The raised and handled sets are compared case-blind, which is exactly how the
   * runtime does NOT compare them: `get_event( ) = val` is a string
   * comparison, so `_event( \`save\` )` never reaches `WHEN \`SAVE\``. A
   * raised spelling that no handler carries, where exactly one handled
   * spelling is the same name up to case, is that defect — and the fix
   * writes the handler's spelling into the raise, because the handler is
   * the one place the name is compared. Two handled spellings of one name
   * are left alone: which of them to follow would be a guess. */
  const handledRaw = handledEventLiterals(src);
  for (const r of raisedEventLiterals(src)) {
    if (handledRaw.includes(r.name)) continue;
    const spelt = [...new Set(handledRaw.filter((h) => h.toUpperCase() === r.name.toUpperCase()))];
    if (spelt.length !== 1) continue;
    report({
    value: r.name, member: spelt[0], offset: r.offset,
      fixes: [{ start: r.at, end: r.at + r.name.length, text: spelt[0] }],
    });
  }
}

export default defineRule({
  id: 'event-name-case-mismatch',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'an event raised as `save` and handled as `SAVE` — the handler never runs',
  detail: 'The event name travels to the browser and back as a string, and `client->get_event( )` / `check_on_event( )` compare it letter for letter. A raise spelled differently from its handler — `_event( `save` )` against `WHEN `SAVE`` — is a dead control that looks handled: the name is there, in both places, and a case-blind reading (which is what `event-without-handler` does, on purpose) sees it as fine. Reported where exactly ONE handled spelling is the raised name up to case; two handled spellings of one name are left alone rather than chosen between. The fix writes the handler\'s spelling into the raise, because the handler is the one place the name is compared.',
  example: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`save\` ) )
" … CASE client->get_event( ).
"      WHEN \`SAVE\`.   " never reached`,
  remedy: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`SAVE\` ) )
" … CASE client->get_event( ).
"      WHEN \`SAVE\`.`,
  fixNote: 'The raised literal is rewritten to the handler\'s spelling — `_event( \\`save\\` )` becomes `_event( \\`SAVE\\` )` — inside the literal\'s own quotes; the arguments around it are untouched.',
  message: (f) => `event \`${f.value}\` is raised but the handler reads \`${f.member}\` — get_event( ) compares letter for letter, so the handler never runs; write \`${f.member}\` in the raise`,
  check,
});
