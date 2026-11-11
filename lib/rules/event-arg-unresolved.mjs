import { defineRule } from '../rule.mjs';
import { backendEventCalls } from '../abap-helpers.mjs';

function check({ src, report }) {
  /* A t_arg value the app expects the CLIENT to resolve must be $-prefixed:
   * the runtime (z2ui5_cl_ui5_srv_event=>get_t_arg) sends `$...` and `{...}`
   * entries to the frontend verbatim, but only a $-prefixed expression is
   * resolved by UI5 before the roundtrip - a bare-brace `{COL}` is neither
   * resolved nor quoted, so get_event_arg( ) receives an EMPTY value with no
   * error anywhere. The one legitimate bare-brace form is a client-composed
   * template that STARTS with a {N} placeholder ({0}, {1?...}), which the
   * runtime quotes as a plain string. */
  // ONLY client->_event( ) - a BACKEND event, whose t_arg values travel back
  // and are read with get_event_arg( ). client->_event_client( ) and
  // follow_up_action( ) are FRONTEND actions: their t_arg is the argument list
  // of the action itself, and a brace object there is the documented way to
  // hand a parameter set to the frontend (cs_event-urlhelper takes
  // |\{ URL: '…', NEW_WINDOW: true \}|). Flagging those would be wrong.
  for (const { evOpen, argLit, open, body, argBase } of backendEventCalls(src).calls) {
    /* The unresolved-brace check owes the shorthand the same coverage: a bare
     * `{COL}` reaches the frontend unresolved and unquoted whichever spelling
     * carried it, and reading it back gives an empty value with no error. Run
     * before the t_arg branch below, which a call spelling its one argument
     * as `arg` never enters. */
    if (argLit) {
      const isTemplate = argLit[3] !== undefined;
      const raw = isTemplate ? argLit[3] : argLit[2];
      const lit = String(raw).trim();
      const bad = isTemplate ? lit.startsWith('\\{') : lit.startsWith('{');
      const shown = lit.replace(/\\/g, '');
      if (bad && !/^\{\d+[?}]/.test(shown)) {
        let fixes;
        if (!isTemplate) {
          const brace = evOpen + 1 + argLit.index + argLit[0].indexOf(argLit[1]) + 1 + raw.indexOf('{');
          fixes = [{ start: brace, end: brace, text: '$' }];
        }
        report({
          value: shown.slice(0, 40),
          offset: evOpen + 1 + argLit.index, ...(fixes ? { fixes } : {}),
        });
      }
    }
    if (!body) continue;
    // body[i] is src[argBase + i]: the one base every offset and fix below
    // is computed from. A finding used to take the t_arg TOKEN's position
    // plus an index into the VALUE body - two coordinate systems, ~16
    // columns apart, which put the finding on the previous line and out of
    // reach of a disable-next-line directive.
    // Only a `backtick` / 'quoted' literal hands its braces to the frontend
    // verbatim. A |…| STRING TEMPLATE is ABAP: |{ badgemin }| interpolates the
    // variable server-side and sends its value - perfectly correct, and not
    // this rule's business. A template only reaches the frontend with braces
    // when they are escaped (|\{COL\}|), which is the bad form again.
    for (const el of body.matchAll(/\(\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)\s*\)/g)) {
      const isTemplate = el[3] !== undefined;
      const raw = isTemplate ? el[3] : el[2];
      const lit = raw.trim();
      const bad = isTemplate ? lit.startsWith('\\{') : lit.startsWith('{');
      if (!bad) continue;
      const shown = lit.replace(/\\/g, '');
      if (/^\{\d+[?}]/.test(shown)) continue; // {N} template placeholder - quoted, fine
      /* Autofixable in the literal form: the missing `$` is a pure insertion
       * in front of the brace. body[i] is src[evOpen + open + 2 + i], and the
       * literal starts one character past its own quote. A |…| template is
       * left alone - there the braces are escaped ABAP, not a UI5 expression. */
      let fixes;
      if (!isTemplate) {
        const brace = evOpen + open + 2 + el.index + el[0].indexOf(el[1]) + 1 + raw.indexOf('{');
        fixes = [{ start: brace, end: brace, text: '$' }];
      }
      report({ value: shown.slice(0, 40), offset: argBase + el.index, ...(fixes ? { fixes } : {}) });
    }
  }
}

export default defineRule({
  id: 'event-arg-unresolved',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a bare-brace `t_arg` literal (`` `{COL}` ``)',
  detail: 'The runtime sends it verbatim, but only `$`-prefixed expressions are resolved by UI5 — so `get_event_arg( )` receives an **empty** value, with no error anywhere. Write `` `${COL}` ``. A template that starts with a `{0}` placeholder is fine: that form is quoted.',
  example: 'client->_event( val = `PICK` t_arg = VALUE #( ( `{/ID}` ) ) )   " arrives empty',
  remedy: 'client->_event( val = `PICK` t_arg = VALUE #( ( `${/ID}` ) ) )   " resolved',
  fixNote: 'The missing `$` is inserted in the literal form; a `|…|` template is left alone.',
  message: (f) => `t_arg ${f.value} is a bare-brace literal — it is neither resolved nor quoted and arrives EMPTY at get_event_arg( ); use the $-prefixed form (\${...}) for a client-resolved value`,
  check,
});
