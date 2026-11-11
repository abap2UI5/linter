import { defineRule } from '../rule.mjs';
import { clientCalls, namedArgMarks, parenRegion } from '../abap.mjs';

function check({ code, src, report }) {
  /* popover_display imports XML, not VAL — the one asymmetry in the display
   * family (popup_display takes val). A `val =` guessed by analogy does not
   * compile, but nothing in a systemless pipeline says so before activation:
   * abaplint has no signature knowledge of z2ui5_if_client, and the render
   * gate never sees the class fail. One of the most common first-try
   * mistakes in generated code (samples-controls hold-out probes 607/613/617). */
  /* The client's popover_display( ) only (an app's own `my_popover_display(
   * val = … )` is no such call), and `val` wherever it stands among the
   * named arguments - the same reading as popup-display-xml. */
  for (const m of clientCalls(code, (method) => method === 'popover_display')) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    const val = body === undefined ? null : namedArgMarks(body).find((a) => a.name === 'val');
    if (!val) continue;
    const start = open + 1 + val.nameStart;
    report({
      member: 'val', offset: m.index,
      fixes: [{ start, end: start + 3, text: 'xml' }],
    });
  }
}

export default defineRule({
  id: 'popover-display-val',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: '`popover_display( val = … )` — the parameter is `xml`',
  detail: 'The one asymmetry in the display family: `popup_display( )` imports `val`, `popover_display( )` imports `xml`. A `val =` guessed by analogy does not compile — but nothing in a systemless pipeline says so before activation, so the mistake rides along until the class first meets a compiler. One of the most common first-try mistakes in generated code.',
  example: 'client->popover_display( val = popover->stringify( ) ).   " does not compile',
  remedy: 'client->popover_display( xml = popover->stringify( ) ).',
  fixNote: 'The parameter name is rewritten to `xml`, the argument untouched.',
  message: (f) => 'client->popover_display( val = … ) does not compile — popover_display imports xml, not val (unlike popup_display)',
  check,
});
