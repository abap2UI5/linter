import { defineRule } from '../rule.mjs';
import { parenRegion, statementSpan } from '../abap.mjs';

function check({ code, source, src, report }) {
  /* The manual model pushes do NOTHING. The framework compares the model
   * state before main( ) with the state after it returned and, when they
   * differ, sends it to every open view slot by itself - so view_model_update
   * and its four siblings are deliberately EMPTY methods in
   * z2ui5_cl_ui5_client, kept in the interface only so existing apps keep
   * compiling. A leftover call is not just dead weight, it is misleading: it
   * reads as "the model is pushed here" at a place where nothing happens.
   * Deleting it is the whole correction, so it carries the fix. */
  for (const m of code.matchAll(/client->((?:nest2?_)?view_model_update|popup_model_update|popover_model_update)\s*\(/gi)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { end } = parenRegion(src, open);
    /* Only a statement of its own is deleted - these methods return nothing,
     * so that is the only shape they legally have, and a call this pass
     * cannot see the end of is reported without a fix rather than cut. */
    const dot = src.slice(end + 1).match(/^\s*\./);
    /* The statement starts at the HANDLE, not at `client`: `li_client->…( ).`
     * and `me->client->…( ).` are the same call, and a span measured from
     * `client` cut the statement out from the middle and left `li_` and
     * `me->` behind - invalid ABAP the second pass called clean. */
    let head = m.index;
    while (head > 0 && /[\w>-]/.test(code[head - 1])) head--;
    report({
      member: m[1], offset: head,
      ...(dot ? { fixes: [{ ...statementSpan(source, head, end + 1 + dot[0].length), text: '' }] } : {}),
    });
  }
}

export default defineRule({
  id: 'obsolete-model-update',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: '`view_model_update( )` & friends — empty methods, the model is pushed automatically',
  detail: 'The framework compares the model state before `main( )` with the state after it returned and, when they differ, sends it to every open view slot by itself. `view_model_update( )`, `nest_view_model_update( )`, `nest2_view_model_update( )`, `popup_model_update( )` and `popover_model_update( )` are therefore deliberately **empty** methods, kept in `z2ui5_if_client` only so existing apps keep compiling. A leftover call is not merely dead weight — it reads as "the model is pushed here" at a place where nothing at all happens. Delete it. The one thing that went with them is the ability to force an *unchanged* model back onto the client (a control that wrote a bound property without sending it back): rebuild the view with `view_display( )` for that.',
  example: 'client->popup_model_update( ).   " does nothing',
  remedy: '" nothing - the model travels with the roundtrip; delete the call',
  fixNote: 'The call is deleted, together with the line when it has that line to itself; a line shared with other code or a trailing comment keeps everything but the call.',
  message: (f) => `client->${f.member}( ) does nothing — the framework pushes the model by itself whenever a roundtrip changed it; delete the call`,
  check,
});
