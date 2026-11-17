import { defineRule } from '../rule.mjs';
import { displayFlow } from '../lifecycle-rules.mjs';
import { branchTail } from '../abap-source.mjs';

function check({ src, report }) {
  const { DISPLAY, SLOT, blank, afterStatement } = displayFlow(src);
  /* The same slot displayed twice in one sequence. The second call replaces
   * what the first built before the browser ever saw it — the first is dead
   * code, and the view it built (often a different one) is the one the
   * author probably meant to keep or to branch on. */
  for (const m of blank.matchAll(DISPLAY)) {
    const from = afterStatement(m.index);
    if (from === -1) continue;
    const tail = branchTail(src, from);
    const again = new RegExp(`\\b(?:me->)?\\w*client\\s*->\\s*${m[1]}\\s*\\(`, 'i').exec(tail.text);
    if (again) {
      report({ member: SLOT[m[1].toLowerCase()], offset: from + again.index, dedupe: String(m.index) });
    }
  }
}

export default defineRule({
  id: 'double-display-in-branch',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `the ${f.member} slot is displayed twice in the same flow — the second call replaces the first before the browser sees it, so the first is dead code`,
  check,
});
