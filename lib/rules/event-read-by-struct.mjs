import { defineRule } from '../rule.mjs';

function check({ code, report }) {
  /* `client->get( )-event` and `client->get_event( )` read the same field:
   * get_event( ) is documented in z2ui5_if_client as the shortcut for it,
   * made for the dispatcher idiom `CASE client->get_event( ).`, and both
   * return the event name as a string. Both are legal and the readers of this
   * linter take both (EVENT_READ, lib/abap-helpers.mjs) - so this is a hint,
   * not a defect. It exists because the struct form is what code written
   * before 1.143 - and a model that learned from it - writes, beside the rest
   * of that API that is gone now; the method is the form the guide, the
   * samples and the framework's own documentation use.
   *
   * Only `-event` is renamed. `get( )-t_event_arg` is the WHOLE argument
   * list; get_event_arg( n ) reads one position, so the two are not one call
   * in two spellings and the list read is left alone. The match stops at a
   * longer component (`-event_x`, `-event-…`) - that is no read of `event`. */
  for (const m of code.matchAll(/client->(get\s*\(\s*\)\s*-\s*event)(?![\w-])/gi)) {
    const start = m.index + m[0].indexOf(m[1]);
    report({
      member: 'event', offset: m.index, dedupe: String(start),
      fixes: [{ start, end: start + m[1].length, text: 'get_event( )' }],
    });
  }
}

export default defineRule({
  id: 'event-read-by-struct',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'app',
  fixable: true,
  message: () => 'client->get( )-event reads the event through the structure — client->get_event( ) is the same read, the one the guide and the samples use',
  check,
});
