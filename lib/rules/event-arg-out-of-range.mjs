import { defineRule } from '../rule.mjs';
import { backendEventCalls, eventScopes } from '../abap-helpers.mjs';

function check({ src, report }) {
  const { arity } = backendEventCalls(src);
  /* Reading past the t_arg the event declares. The args are static - they are
   * written at the raise site - so `get_event_arg( 3 )` in the handler of an
   * event that sends two is never anything but a mistake: it returns initial
   * in ABAP and 500s in the transpiled runtime, and either way the value the
   * handler works with is not the one the author meant. Only a literal index
   * is judged (a variable one is not statically knowable), and only inside
   * the handler of an event this class raises itself. */
  if (arity.size) {
    const scopes = eventScopes(src);
    for (const m of src.matchAll(/get_event_arg\s*\(\s*(?:v\s*=\s*)?(?:(\d+)\s*)?\)/gi)) {
      const read = m[1] ? Number(m[1]) : 1; // the interface default is 1
      let scope = null;
      for (const s of scopes) {
        if (s.at < m.index) scope = s; else break;
      }
      /* The NEAREST preceding marker decides, whatever event it names - and
       * if that is a method boundary, or an event this class does not raise
       * with client->_event( ), the call is not judged at all. An event can
       * also arrive from a message_box_display( onclose = ) callback or a
       * frontend action, and those carry args from a source this pass cannot
       * see; skipping there is the difference between a rule and a guess. */
      if (!scope?.event || !arity.has(scope.event)) continue;
      const sent = arity.get(scope.event);
      if (read > sent) {
        report({ value: scope.event, member: String(read), count: sent, offset: m.index });
      }
    }
  }
}

export default defineRule({
  id: 'event-arg-out-of-range',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: '`get_event_arg( n )` past the `t_arg` the event declares',
  detail: 'The arguments are static — they are written at the raise site — so reading past them is never anything but a mistake: initial in ABAP, a 500 in the transpiled runtime, and either way not the value the handler works with. Judged only for a literal index, inside the handler of an event the class raises itself with `client->_event( )`, and never across a method boundary: an event arriving from a `message_box_display( onclose = )` callback or a frontend action carries arguments from a source this pass cannot see.',
  example: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( val = \`PICK\` t_arg = VALUE #( ( \`\${$source>/id}\` ) ) ) ).
CASE client->get( )-event.
  WHEN \`PICK\`.
    DATA(second) = client->get_event_arg( 2 ).   " PICK sends one argument
ENDCASE.`,
  remedy: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( val = \`PICK\` t_arg = VALUE #( ( \`\${$source>/id}\` ) ) ) ).
CASE client->get( )-event.
  WHEN \`PICK\`.
    DATA(id) = client->get_event_arg( 1 ).   " the one argument PICK sends
ENDCASE.`,
  message: (f) => `get_event_arg( ${f.member} ) in the handler of ${f.value}, which sends ${f.count} t_arg — the read comes back empty`,
  check,
});
