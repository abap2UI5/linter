import { defineRule } from '../rule.mjs';
import { parenRegion, topAssigned, topRows } from '../abap.mjs';

export default defineRule({
  id: 'value-header-default-reassigned',
  severity: 'error',
  category: 'lifecycle',
  scope: 'class',
  summary: 'a `VALUE` component assigned in the header and again in a row',
  detail: 'A component assigned before the first line spec is a DEFAULT for all following lines, not an overridable one, so assigning it again inside a row makes the system\'s syntax check refuse the whole constructor: *"The component was specified more than once."* abaplint accepts the construct without a finding — its `VALUE` grammar does not model the one-assignment rule — so this reached a repository\'s main branch through a green CI and was found by a user running Code Inspector\'s SYNTAX_CHECK over a pulled copy. Write the value per row instead, or close the header\'s scope with a second group: the default binds only to the lines *after* it.',
  example: 'VALUE #( selectable = abap_true ( a = 1 ) ( a = 2 selectable = abap_false ) )',
  remedy: 'VALUE #( ( a = 1 selectable = abap_true ) ( a = 2 selectable = abap_false ) )',
  message: (f) => `${f.member} is assigned in the VALUE header AND inside a row — the header assignment is a DEFAULT for all following lines, not an overridable one, so the syntax check refuses the constructor with "the component was specified more than once"; write it per row, or close the header's scope with a second group`,
  check({ model, report }) {
    const { code: blankHygiene } = model;
    /* A component assigned in the VALUE HEADER and again inside a row. The
     * header assignment is a DEFAULT for all following lines, not an overridable
     * one, so the system's syntax check refuses the whole constructor with "The
     * component was specified more than once". abaplint accepts it: its VALUE
     * grammar does not model the one-assignment rule. Reached main through a
     * port and was found by a user running SYNTAX_CHECK over a pulled repo.
     * The way out is a second group — the default binds only to the lines AFTER
     * it — or writing the value per row. */
    for (const m of blankHygiene.matchAll(/\bVALUE\s+(?:#|[A-Za-z_][\w/]*)\s*\(/gi)) {
      const open = blankHygiene.indexOf('(', m.index + m[0].length - 1);
      const { body } = parenRegion(blankHygiene, open);
      if (body === undefined) continue;
      const rows = topRows(body);
      if (!rows.length) continue;
      const header = topAssigned(body);
      if (!header.size) continue;
      /* Only the rows AFTER the header assignment are bound by it — a group
       * opened before it is out of its scope, and closing the scope that way is
       * the documented remedy. `topAssigned` reads the top level, so the header
       * components are those assigned outside any row; a row that re-assigns one
       * of them is the defect. */
      for (const r of rows) {
        for (const field of topAssigned(r.body)) {
          if (!header.has(field)) continue;
          report({
            member: field,
            offset: open + 1 + r.offset,
          });
        }
      }
    }
  },
});
