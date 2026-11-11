import { defineRule } from '../rule.mjs';
import { clientCalls, parenRegion } from '../abap.mjs';
import { caseMatch } from '../suggest.mjs';

function check({ code, src, viewIds, report }) {
  /* popover_display anchors its fragment to a control id (by_id) — and a
   * literal id no view of this class declares is the quietest failure in the
   * display family: the fragment LOADS, then displayPopover logs "openBy
   * control not found" and DESTROYS it again. Nothing opens, nothing
   * renders red, and the property gate saw a perfectly valid fragment.
   * Judged under the same viewIds trust condition as the wire rules. */
  if (viewIds) {
    for (const m of clientCalls(code, (method) => method === 'popover_display')) {
      const open = m.index + m[0].length - 1;
      const { body } = parenRegion(src, open);
      const idm = body.match(/\bby_id\s*=\s*`([^`]*)`/i);
      if (idm && !viewIds.has(idm[1])) {
        const suggestion = caseMatch(idm[1], viewIds);
        const at = open + 1 + idm.index + idm[0].length - 1 - idm[1].length;
        report({
          ...(suggestion ? { written: idm[1], suggestion, fixes: [{ start: at, end: at + idm[1].length, text: suggestion }] } : {}),
          member: 'by_id', value: idm[1],
          allowed: [...viewIds].sort(), offset: open + 1 + idm.index,
        });
      }
    }
  }
}

export default defineRule({
  id: 'popover-anchor-unknown-id',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: '`popover_display( by_id = … )` anchored to an id no view declares',
  detail: 'A popover opens **by** a control — `by_id` names its anchor. With a literal id no view of the class declares, the fragment loads, `displayPopover` finds no `openBy` control, logs it and **destroys the fragment again**: nothing opens, nothing renders red, and the property gate saw a perfectly valid fragment. Judged under the same trust condition as `frontend-action-unknown-id` — only when every `id` attribute of the class is a literal.',
  example: `)->a( n = \`id\` v = \`btnInfo\` )
" …
client->popover_display( xml = popover->stringify( ) by_id = \`btninfo\` ).`,
  remedy: `)->a( n = \`id\` v = \`btnInfo\` )
" …
client->popover_display( xml = popover->stringify( ) by_id = \`btnInfo\` ).`,
  fixNote: 'Where exactly one id a view of this class declares is the written `by_id` up to letter case, the finding names it and `--fix` rewrites the literal. Otherwise no suggestion is made.',
  message: (f) => `popover_display( by_id = \`${f.value}\` ) names an id no view of this class declares (known: ${[].concat(f.allowed || []).join(', ')}) — the fragment loads, finds no anchor and is destroyed again; nothing opens` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
