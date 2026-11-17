import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'chain-unbalanced-parens',
  summary: 'a builder chain whose parentheses do not balance — one `)` too many, or one never closed',
  detail: 'A builder chain is one statement over many lines, and every call in it opens a parenthesis the next line closes — so the closing run at its end (`) ) ).`) is where one too many or one too few goes unnoticed. The class does not activate with it, which no systemless pipeline sees. Worse for this gate: the statement reader counts parentheses, a stray `)` leaves the count at minus one, the chain\'s own `.` stops being a statement end, and the chain is read together with the display call behind it — the class then reconstructs **no view at all**, and until this rule existed the run reported nothing and exited 0. A `(` never closed does the same in the other direction and swallows the rest of the file. The scan behind this rule recovers at the stray parenthesis, so the finding names the line that carries it; only statements with a builder call in them are judged.',
  example: `view->tag( \`Button\`
    )->a( n = \`text\` v = \`Go\` ) ).   " one ) too many`,
  remedy: `view->tag( \`Button\`
    )->a( n = \`text\` v = \`Go\` ).`,
});
