import { defineRule } from '../rule.mjs';

export default defineRule({
  id: 'event-arg-default-index',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'class',
  fixable: true,
  message: (f) => 'get_event_arg( 1 ) spells out the default — v TYPE i DEFAULT 1, so get_event_arg( ) reads the same first argument; pass an index only from the second on',
  check({ model, report }) {
    const { code: blankHygiene } = model;
    /* `get_event_arg( 1 )` spells out the default: the parameter is
     * `v TYPE i DEFAULT 1`, so the call with no argument reads the same first
     * argument. Not a defect, and fixable mechanically — the argument is
     * deleted, whichever of the two spellings (`1`, `v = 1`) it has. */
    for (const m of blankHygiene.matchAll(/\bget_event_arg\s*\(\s*(?:v\s*=\s*)?1\s*\)/gi)) {
      const open = m.index + m[0].indexOf('(');
      const close = m.index + m[0].length - 1;
      report({
        dedupe: String(m.index), offset: m.index,
        fixes: [{ start: open + 1, end: close, text: ' ' }],
      });
    }
  },
});
