import { defineRule } from '../rule.mjs';
import { CONTROL_METHOD_KINDS } from '../frontend-actions.mjs';

function check({ action, args, report }) {
  /* Arity and kind, for the control methods the frontend DECLARES (the
   * open, unlisted ones carry no declaration and are never judged here).
   *
   * `castArgs` slices the declared kinds, so an argument past them is not
   * passed to the control at all — it reads as intent and is dead weight.
   * The kinds themselves are load-bearing: `int` runs through `Number( )`,
   * so a non-numeric literal arrives as NaN and every comparison against it
   * is false; `bool` is `raw === "true" || raw === "X"`, so a literal that
   * is neither of those and none of the false spellings silently means
   * FALSE — `1`, `TRUE` and `abap_true` all switch the flag off. */
  if (action !== 'control_by_id' || !args[1]?.value) return;
  const kinds = CONTROL_METHOD_KINDS[args[1].value];
  const sent = args.slice(2);
  if (kinds && sent.length > kinds.length) {
    report({
      control: 'CONTROL_BY_ID', member: args[1].value,
      value: String(sent.length), count: kinds.length,
      offset: (sent[kinds.length] ?? args[1]).offset,
    });
  }
}

export default defineRule({
  id: 'control-call-arg-count',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'more `t_arg` values than the control method declares',
  detail: 'The frontend declares the argument kinds of every control method it knows, and `castArgs` ends on `kinds.slice(0, count)` — so an argument past the declared ones is never passed to the control. It is not an error anywhere: the call runs, with fewer arguments than the source appears to give it, and the extra value reads as intent to every later reader. `back`, `close`, `focus`, `collapseAll` and the other no-argument methods are the common case; `setExpanded` given two is the other. A method the frontend does NOT declare is open by design (any public, non-denylisted one) and is never judged on arity.',
  example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`nav\` ) ( \`back\` ) ( \`page2\` ) ) )   " back takes none`,
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`nav\` ) ( \`back\` ) ) )`,
  message: (f) => `${f.member} takes ${f.count === 0 ? 'no arguments' : `${f.count} argument${f.count === 1 ? '' : 's'}`}, and ${f.value} are sent — castArgs slices the declared kinds, so the extra one never reaches the control`,
  check,
});
