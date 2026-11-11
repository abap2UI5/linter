import { defineRule } from '../rule.mjs';
import { clientCalls, namedArgMarks, parenRegion } from '../abap.mjs';

function check({ src, code, report }) {

  /* The mirror of popover-display-val: popup_display( ) imports VAL and the
   * popover XML, so an `xml =` on the popup does not compile either - and
   * nothing in a systemless pipeline says so before activation. The guide
   * (§6): "Mind the asymmetry: the popup takes its XML as `val`, the popover
   * as `xml` - one of the most common first-try mistakes." */
  /* On the CLIENT's popup_display( ) only, read like every other client
   * call here - `\bpopup_display\s*\(\s*xml =` matched an app's own
   * `my_popup_display( xml = … )` too - and the `xml` argument wherever it
   * stands among the named ones. */
  for (const m of clientCalls(code, (method) => method === 'popup_display')) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const xml = namedArgMarks(body).find((a) => a.name === 'xml');
    if (!xml) continue;
    const start = open + 1 + xml.nameStart;
    report({
      member: 'xml', offset: m.index,
      fixes: [{ start, end: start + 3, text: 'val' }],
    });
  }
}

export default defineRule({
  id: 'popup-display-xml',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: '`popup_display( xml = … )` — the parameter is `val`',
  detail: 'The mirror of `popover-display-val`, the same asymmetry read from the other side: `popup_display( )` imports `val`, `popover_display( )` imports `xml`. The guide (§6): "**Mind the asymmetry**: the popup takes its XML as `val`, the popover as `xml` — one of the most common first-try mistakes." An `xml =` guessed from the popover does not compile, and nothing in a systemless pipeline says so before activation — abaplint has no signature knowledge of `z2ui5_if_client`, and the render gate never sees the class fail.',
  example: 'client->popup_display( xml = popup->stringify( ) ).   " does not compile',
  remedy: 'client->popup_display( val = popup->stringify( ) ).',
  fixNote: 'The parameter name is rewritten to `val`, the argument untouched.',
  message: (f) => 'client->popup_display( xml = … ) does not compile — popup_display imports val, not xml (unlike popover_display)',
  check,
});
