import { defineRule } from '../rule.mjs';
import { backendEventCalls, countElements, firstElement } from '../abap-helpers.mjs';

function check({ src, report }) {
  for (const { evOpen, evBody, argSupplied, tm, open, body, region } of backendEventCalls(src).calls) {
    if (!tm) continue;
    /* ONE row written as a table. `arg` is the one-value spelling of `t_arg`:
     * the client folds `arg = x` into the same string_table as
     * `t_arg = VALUE #( ( x ) )` - literally the same wire, read back with
     * the same `get_event_arg( )` - and the single argument is what most
     * wires carry (a row key, a `${$source>/...}`, one event parameter),
     * where the table constructor is longer than the value inside it. From
     * two values on `t_arg` is the right parameter and this stays silent.
     *
     * Only `client->_event( )`: `_event_client( )` and `follow_up_action( )`
     * have no `arg` parameter, and the surrounding loop already excludes
     * them.
     *
     * Silent, not merely unfixable, when both spellings are present (the
     * documented composition appends `arg` BEHIND the rows, so the call
     * sends two arguments and neither collapses) and when the row contains a
     * `#`: `arg` is generic (`TYPE clike`), so a `CONV #( )` / `VALUE #( )`
     * inside it has no type to derive `#` from and the remedy would not
     * compile. A finding whose remedy does not compile is worse than none. */
    /* An UNCLOSED VALUE - a truncated source, a class the fuzzer cut mid-call
     * - gets end === evBody.length back, which is one past the last character
     * rather than a closing paren. Rewriting that span addresses text this
     * source does not have, and the fixer throws on it under strict fixes. */
    const closed = region.end < evBody.length;
    const row = closed && countElements(body) === 1 ? firstElement(body) : null;
    const rowText = row ? body.slice(row.open + 1, row.end).trim() : '';
    if (row && rowText && !argSupplied && !rowText.includes('#')) {
      report({
        // shown whole up to ~40 characters, then cut between tokens (a backtick literal is one token) with an ellipsis, never mid-literal
        value: (rowText.match(/`[^`]*`?|[^\s`]+/g) ?? [rowText]).reduce((s, t) => (!s ? t : s.endsWith('…') ? s : `${s} ${t}`.length <= 40 ? `${s} ${t}` : `${s}…`), ''),
        offset: evOpen + 1 + tm.index,
        fixes: [{
          start: evOpen + 1 + tm.index,
          end: evOpen + 1 + region.end + 1,
          text: `arg = ${rowText}`,
        }],
      });
    }
  }
}

export default defineRule({
  id: 'event-arg-single-row-table',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  summary: '`t_arg = VALUE #( ( x ) )` for a single argument',
  detail: '`arg` is the one-value spelling of `t_arg`: the client folds `arg = x` into the same `string_table` as `t_arg = VALUE #( ( x ) )`, so the wire is byte for byte the same and the handler reads it back with the same `get_event_arg( )`. The single argument is what most wires carry — a row key, a `${$source>/…}`, one event parameter — and there the table constructor is longer than the value inside it. Not a defect; the shorter spelling is the one to teach. From two values on `t_arg` is the right parameter and this rule stays silent, as it does when both are passed (the documented composition appends `arg` behind the rows, so the call sends one more argument, not the same one). Only `client->_event( )` has the parameter — `_event_client( )` and `follow_up_action( )` are frontend actions and are never judged. A hint, and fixable. One row is left alone on purpose: a row containing a `#` (`CONV #( )`, a nested `VALUE #( )`), because `arg` is generic (`TYPE clike`) and `#` has no type to derive there — the remedy would not compile.',
  example: 'v = client->_event( val = `EDIT` t_arg = VALUE #( ( `${PRODUCT}` ) ) )',
  remedy: 'v = client->_event( val = `EDIT` arg = `${PRODUCT}` )',
  fixNote: 'The `t_arg = VALUE #( ( x ) )` span becomes `arg = x` in place. A call written over two lines collapses onto the first — the continuation kept its column, so a chain stays aligned; the padding that only existed to line `val   =` up with `t_arg =` is left as written.',
  message: (f) => `t_arg = VALUE #( ( ${f.value} ) ) builds a one-row table for a single argument — arg = ${f.value} is the same wire, folded into the same string_table and read back with the same get_event_arg( ); keep t_arg from two values on`,
  check,
});
