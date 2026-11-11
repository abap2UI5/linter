import { defineRule } from '../rule.mjs';
import { backendEventCalls } from '../abap-helpers.mjs';

function check({ source, src, report }) {
  for (const { tm, body, argBase } of backendEventCalls(src).calls) {
    if (!tm) continue;
    /* A TRAILING empty argument never arrives. get_t_arg buffers an empty
     * entry and only flushes it when a later non-empty one follows - the
     * comment in z2ui5_cl_ui5_srv_event says so - so an empty entry between
     * filled ones keeps its slot and a trailing one simply disappears. The
     * handler's `get_event_arg( <n> )` for that position then reads initial
     * and the author never learns why.
     *
     * The framework pads a missing trailing argument only for a NULLABLE
     * declared kind on a control method (control-method-null-arg), which is a
     * CONTROL_BY_ID concern - a backend `_event` has no declared kinds, so
     * nothing pads it here. Only the LAST entry is judged; an empty one in
     * the middle is correct and deliberate. */
    const argEls = [...body.matchAll(/\(\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)\s*\)/g)];
    const last = argEls[argEls.length - 1];
    if (argEls.length > 1 && last) {
      const raw = last[3] !== undefined ? last[3] : last[2];
      if (String(raw).trim() === '') {
        /* Mechanically fixable: the row never arrives, so deleting it changes
         * nothing the handler can observe. The span is measured on the
         * ORIGINAL source (the same statementSpan doctrine): a row with its
         * line to itself takes the whole line, an inline row also eats the
         * spaces in front of it, and the walk back stops at anything that is
         * not plain whitespace THERE - so a comment scrub( ) blanked to
         * spaces is never deleted along with the row. */
        const rowStart = argBase + last.index;
        const rowEnd = rowStart + last[0].length;
        let span;
        if (source) {
          const lineStart = source.lastIndexOf('\n', rowStart - 1) + 1;
          const nl = source.indexOf('\n', rowEnd);
          const lineEnd = nl === -1 ? source.length : nl + 1;
          if (!source.slice(lineStart, rowStart).trim() && !source.slice(rowEnd, nl === -1 ? source.length : nl).trim()) {
            span = { start: lineStart, end: lineEnd };
          } else {
            /* An inline row eats the spaces in front of it - unless those
             * spaces are the line's indentation (the row opens the line and
             * something follows it): eating them would pull `) )` to column
             * one. */
            let s = rowStart;
            while (s > lineStart && (source[s - 1] === ' ' || source[s - 1] === '\t')) s--;
            if (s === lineStart) s = rowStart;
            span = { start: s, end: rowEnd };
          }
        }
        report({
          value: String(argEls.length),
          offset: argBase + last.index,
          ...(span ? { fixes: [{ ...span, text: '' }] } : {}),
        });
      }
    }
  }
}

export default defineRule({
  id: 'trailing-empty-event-arg',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'the last `t_arg` entry is empty and never arrives',
  detail: '`get_t_arg` buffers an empty argument and flushes it only when a later non-empty one follows, so an empty entry between filled ones keeps its slot and a TRAILING one disappears. The handler\'s `get_event_arg( n )` for that position reads initial, with no error anywhere. The framework pads a missing trailing argument only for a nullable declared kind on a control method, which does not apply to a backend `_event`.',
  example: 'client->_event( val = `PICK` t_arg = VALUE #( ( `${/ID}` ) ( `` ) ) )   " get_event_arg( 2 ) reads initial',
  remedy: 'client->_event( val = `PICK` t_arg = VALUE #( ( `${/ID}` ) ) )',
  fixNote: 'The trailing empty `( \\`\\` )` row is deleted from the `VALUE #( )` constructor — it never arrives, so removing it changes nothing the handler can observe. A row with its line to itself takes the whole line; an inline row also takes the spaces in front of it. A comment is never removed with it.',
  message: (f) => `the LAST of ${f.value} t_arg entries is empty — get_t_arg drops a trailing empty argument, so it never arrives and get_event_arg( ${f.value} ) reads initial; fill it, drop it, or move it before a filled one`,
  check,
});
