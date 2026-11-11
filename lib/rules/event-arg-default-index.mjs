import { defineRule } from '../rule.mjs';

export default defineRule({
  id: 'event-arg-default-index',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'class',
  summary: '`get_event_arg( 1 )` spells out the default',
  detail: 'The parameter is `v TYPE i DEFAULT 1`, so `get_event_arg( )` reads the same first argument. Not a defect — the call is correct — but the explicit index reads as if the position mattered, and the shortest notation is the ecosystem\'s. Pass an index from the second argument on. A hint, and fixable: the argument is deleted, whichever of its two spellings (`1`, `v = 1`) it has.',
  example: 'mv_id = client->get_event_arg( 1 ).',
  remedy: 'mv_id = client->get_event_arg( ).',
  fixNote: 'The argument is deleted — `get_event_arg( 1 )` and `get_event_arg( v = 1 )` both become `get_event_arg( )`.',
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
