import { defineRule } from '../rule.mjs';
import { clientCalls, namedArgMarks, parenRegion } from '../abap.mjs';
import { NEST_DESTROY_BY_INSERT } from '../guide-rules.mjs';

function check({ src, code, report }) {

  /* A nested display with nothing clearing the anchor first. The interface
   * on `method_destroy`: "the mutator that removes the previous content first
   * (`removeAllContent`, `removeAllItems`); without it every call adds one
   * more fragment." The parameter is OPTIONAL, so the class compiles and the
   * first display looks right; the second one stacks a copy under the first.
   * Fixable where `method_insert` is one of the three mutators the same ABAP
   * Doc names, whose remover is known (NEST_DESTROY_BY_INSERT); any other
   * insert - a FlexibleColumnLayout's `addMidColumnPage`, a runtime value -
   * is reported without a fix. */
  for (const m of clientCalls(code, (method) => method === 'nest_view_display' || method === 'nest2_view_display')) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const marks = namedArgMarks(body);
    if (marks.some((a) => a.name === 'method_destroy')) continue;
    const insert = marks.find((a) => a.name === 'method_insert');
    const literal = insert?.value.match(/^([`'])(\w+)\1$/);
    const destroy = literal ? NEST_DESTROY_BY_INSERT[literal[2].toLowerCase()] : null;
    const at = open + 1 + (insert?.vend ?? 0);
    report({
      member: m[1].toLowerCase(), value: literal?.[2], offset: m.index,
      ...(destroy ? { fixes: [{ start: at, end: at, text: ` method_destroy = ${literal[1]}${destroy}${literal[1]}` }] } : {}),
    });
  }
}

export default defineRule({
  id: 'nest-view-without-destroy',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: 'a `nest_view_display( )` with no `method_destroy`',
  detail: 'A nested view is inserted into a control of the main view through the UI5 mutator named in `method_insert`, "after `method_destroy` has cleared what was there" — and `method_destroy` is OPTIONAL, so the call compiles without it and the first display looks right. The interface\'s ABAP Doc on that parameter: "the mutator that removes the previous content first (`removeAllContent`, `removeAllItems`); without it every call adds one more fragment." The second `nest_view_display( )` of the same slot then stacks a copy under the first, and the anchor grows by one fragment per roundtrip that re-renders it. Both slots are judged (`nest2_view_display( )` has exactly the contract of the first).',
  example: 'client->nest_view_display( val = nest->stringify( ) id = `host` method_insert = `addContent` ).   " the second call shows two',
  remedy: 'client->nest_view_display( val = nest->stringify( ) id = `host` method_insert = `addContent` method_destroy = `removeAllContent` ).',
  fixNote: 'Only where `method_insert` is one of the three mutators the ABAP Doc names — `addContent`, `addItem`, `addPage` — the matching `method_destroy` (`removeAllContent`, `removeAllItems`, `removeAllPages`) is appended after it. Any other insert, or one that is not a literal, keeps the finding without a fix: the right remover is a fact about the anchor control.',
  message: (f) => `client->${f.member}( ) passes no method_destroy — nothing removes the previous fragment first, so every call adds one more${f.value ? `; pair ${f.value} with its removeAll… mutator` : ''}`,
  check,
});
