import { defineRule } from '../rule.mjs';
import { raisedEventLiterals } from '../abap-helpers.mjs';
import { blankLiterals, namedArgMarks, parenRegion } from '../abap.mjs';

/* A roundtrip whose whole job is to close the popup or popover: the event's
 * branch in main( ) does nothing but `client->popup_destroy( )` (or
 * `popover_destroy( )`). The frontend closes the slot by itself with
 * `follow_up_action( val = client->cs_event-popup_close )` wired in the
 * view - no request, no draft load and save, no busy indicator. The app
 * guide names that as THE way to close without backend work; the corpora
 * wrote the roundtrip 71 times.
 *
 * Judged only where the swap is exact: the branch is a `WHEN \`X\`.` of a
 * CASE over the event or an `ELSEIF client->check_on_event( \`X\` ).`, its
 * one statement is the destroy (a comment may stand beside it), and every
 * raise of X in the class is a plain `client->_event( \`X\` )` wired to a
 * button's `press` - no t_arg, no s_ctrl, not an afterClose, nothing raised
 * from the frontend (a timer, a shortcut, an onclose). A branch that also writes state, displays the next popup or
 * leaves the app is backend work and stays. The fix rewrites every raise to
 * the frontend action and deletes the branch; a WHEN whose CASE would keep
 * fewer than two branches and an IF that opens the chain are reported without
 * one. A branch with a comment in it is not judged at all. */
function check({ src, source, frontendRaised, report }) {
  const code = blankLiterals(src);
  const frontend = new Set(frontendRaised.map((r) => String(r.name).toUpperCase()));
  const onclose = new Set([...src.matchAll(/\bonclose\s*=\s*[`'|]([A-Z0-9_]+)[`'|]/gi), ...src.matchAll(/"onClose"\s*:\s*"(\w+)"/g)]
    .map((m) => m[1].toUpperCase()));
  const raises = raisedEventLiterals(src);
  const shapes = [
    { kind: 'when', re: /\bWHEN\s+([`'])([A-Z0-9_]+)\1\s*\.\s*client->(popup|popover)_destroy\(\s*\)\s*\.(?=\s*(?:WHEN|ENDCASE)\b)/gi },
    { kind: 'if', re: /\b(ELSEIF|IF)\s+client->check_on_event\(\s*(?:val\s*=\s*)?([`'])([A-Z0-9_]+)\2\s*\)\s*\.\s*client->(popup|popover)_destroy\(\s*\)\s*\.(?=\s*(?:ELSEIF|ELSE|ENDIF)\b)/gi },
  ];
  for (const { kind, re } of shapes) {
    for (const m of src.matchAll(re)) {
      // a WHEN or IF spelled inside a literal is prose, not a branch
      if (code.slice(m.index, m.index + 2) !== src.slice(m.index, m.index + 2)) continue;
      /* a comment inside the branch is the author explaining it - why the
       * close goes through the backend ON PURPOSE (samples app 462: a
       * companion control snapshots its state right before every
       * roundtrip), or where the logic of a placeholder goes. Not judged:
       * the explanation is the decision */
      if (/["*]/.test(source.slice(m.index, m.index + m[0].length).replace(/[`'|][^`'|\n]*[`'|]/g, ''))) continue;
      const name = (kind === 'when' ? m[2] : m[3]).toUpperCase();
      const slot = (kind === 'when' ? m[3] : m[4]).toLowerCase();
      if (frontend.has(name) || onclose.has(name)) continue;
      const mine = raises.filter((r) => r.name.toUpperCase() === name);
      if (!mine.length) continue;
      const calls = [];
      let plain = true;
      for (const r of mine) {
        const open = src.indexOf('(', r.offset);
        const { body, end } = parenRegion(src, open);
        if (body === undefined || end >= src.length) { plain = false; break; }
        const marks = namedArgMarks(body);
        if (marks.some((a) => a.name !== 'val')) { plain = false; break; }
        if (!/^\s*(?:val\s*=\s*)?[`'|][A-Z0-9_]+[`'|]\s*$/i.test(body)) { plain = false; break; }
        // a button's press only: afterClose, escapeHandler and the like fire
        // around a close the dialog runs itself, and stay the app's business
        if (!/\bn\s*=\s*[`']press[`']\s+v\s*=\s*$/i.test(src.slice(Math.max(0, r.offset - 60), r.offset))) { plain = false; break; }
        calls.push({ start: r.offset, end: end + 1 });
      }
      if (!plain) continue;
      /* the deletion: from the end of the code before the branch to the end
       * of the destroy statement, so the blank lines around it close up the
       * way they stood around the branch */
      let start = m.index;
      while (start > 0 && /\s/.test(src[start - 1])) start--;
      const end = m.index + m[0].length;
      let fixable = true;
      if (kind === 'if' && m[1].toUpperCase() === 'IF') fixable = false;
      if (kind === 'when') {
        const before = code.slice(0, m.index);
        const caseAt = before.search(/\bCASE\b(?![\s\S]*\bCASE\b)/i);
        const after = code.slice(end);
        const endcase = after.search(/\bENDCASE\b/i);
        const others = (caseAt === -1 ? '' : code.slice(caseAt, m.index)) + (endcase === -1 ? '' : after.slice(0, endcase));
        // abaplint's short_case wants two WHEN branches - one left is no CASE
        if ((others.match(/\bWHEN\b/gi) ?? []).length < 2) fixable = false;
      }

      const action = `client->follow_up_action( val = client->cs_event-${slot}_close )`;
      report({
        member: slot, value: name, dedupe: String(m.index), offset: m.index,
        ...(fixable ? { fixes: [...calls.map((c) => ({ start: c.start, end: c.end, text: action })), { start, end, text: '' }] } : {}),
      });
    }
  }
}

export default defineRule({
  id: 'close-only-roundtrip',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  fixable: true,
  message: (f) => `the ${f.value} branch does nothing but ${f.member}_destroy( ) — a whole roundtrip to close the ${f.member}; wire the button with client->follow_up_action( val = client->cs_event-${f.member}_close ), which closes it in the browser, and drop the branch`,
  check,
});
