import { defineRule } from '../rule.mjs';
import { aggregationPath, bindingInfoPaths, bindingPath, relativeBindings } from '../binding-paths.mjs';
import { isBinding } from '../ui5-meta.mjs';

/* `judgePath` and `pathFinding` are the walk's: judgePath counts what it
 * is asked (the run's `tally`), pathFinding adds the did-you-mean. */
function check({ attr, bindings, ctx, full, judgePath, member, node, offset, pathFinding, value, report }) {
  // a bound path the derived model does not have - a silent empty
  // field. An absolute path is checked against the model, a relative
  // one against the row the enclosing aggregation binding hands down
  // a path assembled from an unresolved piece (`|\{{ path }/{ i }/X\}|`
  // in a LOOP) reconstructs as `//X` - judging it judges the guess
  if (!bindings || node.guessedAttrs?.has(attr)) return;
  const bp = bindingPath(value);
  const bpProblem = bp ? judgePath(bindings, bp) : null;
  if (bpProblem) {
    report({ control: full, member: attr, value: bp, ...pathFinding(bpProblem), offset });
  }
  /* The same existence check for ABSOLUTE paths inside complex
   * binding infos (path: '/X', parts included) and expression
   * bindings (${/X}) — the forms the simple-{/X} matcher never
   * saw — and, outside an event, every {/X} a COMPOSITE value is
   * assembled from (`Hello {/NAME}!`). Named models are excluded by
   * construction: their path carries the model prefix before the
   * slash, so it does not START with one. A whole-value {/X} was
   * judged above. */
  if (isBinding(value) && !bp) {
    for (const written of bindingInfoPaths(String(value), { composite: member.set !== 'events' })) {
      const p = written.trim();
      const problem = p ? judgePath(bindings, p) : null;
      if (problem) {
        report({ control: full, member: attr, value: p, ...pathFinding(problem), offset });
      }
    }
  }
  /* The same existence question for a path resolved against a ROW,
   * over every shape a property binding takes rather than only the
   * anchored `{NAME}` one.
   *
   * This read `relativePath( )` until now — `^\{NAME\}$` — so a
   * COMPLEX binding info (`{ path: 'exchangeRate', type: … }`) was
   * never checked against the row it resolves in, and neither was a
   * composite or an expression. That is the gap both porting guides
   * describe in the same words ("no gate catches a stale path"): a
   * port copies the original's camelCase `path:` verbatim, the
   * structural diff normalises case, the render gate mocks the
   * model, and the field renders blank. The collector and the model
   * both already existed; only nothing joined them.
   *
   * `relativeBindings( )` filters to bare relative names, so an
   * absolute path and a named model's are excluded by construction —
   * each has its own arm above. */
  /* An attribute that names an AGGREGATION binds relatively too:
   * `tooltip="{NAME}"` (0..1 with a string alt type - a property
   * binding in all but name) and a nested `items="{T_ITEMS}"`, the
   * table inside the row. Both resolve against the row this control
   * sits in, and neither was judged - a misspelt nested table left
   * the inner template without rows and without a word. Only the
   * binding's own path is read (aggregationPath), never a sorter's
   * or a filter's inside it. */
  const relPaths = member.set !== 'aggregations'
    ? relativeBindings(value)
    : [aggregationPath(value)].filter((p) => p && !p.startsWith('/') && !p.includes('>'));
  if (ctx) {
    for (const rp of relPaths) {
      const problem = judgePath(ctx.row, rp);
      if (!problem) continue;
      report({
        control: full, member: attr, value: rp, context: ctx.path, ...pathFinding(problem), offset,
      });
    }
  }
}

export default defineRule({
  id: 'unknown-binding-path',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
  summary: 'a hand-written `{/TYPO}` the derived model has no path for',
  detail: 'The field just stays empty — no error, anywhere. Inside a bound aggregation a relative `{TYPO}` is resolved against the row, so a misspelled column field is caught too, but only where the row shape is known from the class\'s `TYPES`. The same row is followed into the column templates of a `sap.ui.table` table (`Column.template`, `rowActionTemplate`, `rowSettingsTemplate`), which UI5 clones per row of the table\'s `rows` binding, and under an element binding on a row of a declared table (`binding="{/T_ROWS/3}"`). A tree bound to a structure (`arrayNames`) is not followed: its rows are nodes, not the structure. Never guessed. A field read straight off a table (`{/T/FIELD}`) is reported as a missing row index: the JSONModel reads `FIELD` off the array itself. Write `{/T/0/FIELD}`, or bind the table.',
  example: `DATA name TYPE string.
…
view->tag( \`Text\` )->a( n = \`text\` v = \`{/NAEM}\` )   " the model has NAME`,
  remedy: `DATA name TYPE string.
…
view->tag( \`Text\` )->a( n = \`text\` v = client->_bind( name ) )`,
  fixNote: 'Only where the missing segment is a field of that level up to letter case (`{/mv_text}` for `MV_TEXT`): the segment is rewritten. A path the model really lacks keeps the finding.',
  message: (f) => {
    /* a field read straight off a TABLE - the JSONModel reads FIELD as a
     * property of the array, which is undefined, so this is not a typo but
     * a missing row index (see pathProblem in properties.mjs) */
    if (f.table !== undefined) {
      return `${f.control} ${f.member}="{${f.value}}" — ${f.table}${f.context ? ` in the rows of {${f.context}}` : ''} is a table, and a field is read off a ROW: the path needs a row index ({${f.table}/0/…}) or has to end at the table; as written it resolves to nothing (silently empty)`;
    }
    return f.context
      ? `${f.control} ${f.member}="{${f.value}}" — the rows of {${f.context}} have no such field (silently empty)`
      : `${f.control} ${f.member}="{${f.value}}" — the model has no such path (silently empty)`;
  },
  check,
});
