import { defineRule } from '../rule.mjs';
import { skipLiteral } from '../abap.mjs';

/* A builder chain whose parentheses do not balance. One `)` too many at the
 * end of a chain (`… ) ) ).`) is a syntax error the class does not activate
 * with - and it is also the one defect that takes THIS gate down without a
 * word: splitStatements( ) counts depth, a stray `)` leaves it at -1, the
 * chain's own `.` is no longer a split point and the statement runs on into
 * the next one, so the helper-aware reconstruction reads the chain together
 * with the display call behind it and produces no document at all. Nothing
 * was reported; the run said "no findings". A missing `)` is the same in
 * the other direction: the statement never closes and swallows the rest of
 * the file. Read here, in a scan of its own that RECOVERS at the stray
 * paren, so the finding lands on the chain that carries it. Only a statement
 * with a builder call in it is judged: the rule is about the chain. */
function check({ content, d, report }) {
  const chainCall = new RegExp(`->\\s*${d.verbs}\\s*\\(|${d.factory}\\s*\\(`, 'i');
  let depth = 0;
  let start = 0;
  let stray = -1;
  const judge = (end) => {
    if (stray === -1 && depth <= 0) return;
    const text = content.slice(start, end);
    if (!chainCall.test(text)) return;
    report({
      value: stray !== -1 ? 'one ) too many' : 'one ( never closed',
      offset: stray !== -1 ? stray : start + Math.max(0, text.search(/\S/)),
    });
  };
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '`' || c === '|' || c === "'") { i = skipLiteral(content, i) - 1; continue; }
    if (c === '(') depth++;
    else if (c === ')') { if (depth === 0) { if (stray === -1) stray = i; } else depth--; }
    else if (c === '.' && (depth === 0 || i + 1 === content.length || /\s/.test(content[i + 1]))) {
      /* A `.` before a blank ends the statement even inside a parenthesis -
       * parenRegion's rule (abap.mjs): no ABAP call reaches past one. Read as
       * open to the end of the file, an unclosed `(` swallowed every
       * statement behind it, so a second broken chain went unreported and
       * a stray `)` further down was counted off against it. */
      judge(i);
      start = i + 1;
      depth = 0;
      stray = -1;
    }
  }
  if (depth > 0) judge(content.length); // the file ended inside a parenthesis
}

export default defineRule({
  id: 'chain-unbalanced-parens',
  severity: 'warning',
  category: 'structure',
  scope: 'tree',
  summary: 'a builder chain whose parentheses do not balance — one `)` too many, or one never closed',
  detail: 'A builder chain is one statement over many lines, and every call in it opens a parenthesis the next line closes — so the closing run at its end (`) ) ).`) is where one too many or one too few goes unnoticed. The class does not activate with it, which no systemless pipeline sees. Worse for this gate: the statement reader counts parentheses, a stray `)` leaves the count at minus one, the chain\'s own `.` stops being a statement end, and the chain is read together with the display call behind it — the class then reconstructs **no view at all**, and until this rule existed the run reported nothing and exited 0. A `(` never closed does the same in the other direction and swallows the rest of the file. The scan behind this rule recovers at the stray parenthesis, so the finding names the line that carries it; only statements with a builder call in them are judged.',
  example: `view->tag( \`Button\`
    )->a( n = \`text\` v = \`Go\` ) ).   " one ) too many`,
  remedy: `view->tag( \`Button\`
    )->a( n = \`text\` v = \`Go\` ).`,
  message: (f) => `the parentheses of this builder chain do not balance (${f.value}) — the class does not activate, and the statement reader here runs the chain into the statement behind it, so the class reconstructs no view and no other rule judges it`,
  check,
});
