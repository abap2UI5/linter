import { defineRule } from '../rule.mjs';

/* The ABAP editor strips a trailing blank when it saves, so a line ending
 * in one comes back DIFFERENT on the next pull — permanently, for everyone
 * (abap-check §1). A warning, not an error: nothing fails to import; the
 * file merely never stops diffing. Judged on the RAW line — whitespace is
 * exactly what scrubbing normalizes away — and kept apart by line number.
 *
 * A backwards character scan instead of /[ \t]+$/: the regex is quadratic
 * on a line of many blanks (every start position re-walks the run before
 * failing the anchor - CodeQL js/polynomial-redos), and library input is
 * exactly where such a line comes from. */
function check({ source, report }) {
  let lineStart = 0;
  for (const [i, line] of source.split('\n').entries()) {
    const content = line.replace(/\r$/, '');
    let wsStart = content.length;
    while (wsStart > 0 && (content[wsStart - 1] === ' ' || content[wsStart - 1] === '\t')) wsStart--;
    if (wsStart < content.length) {
      report({
        dedupe: String(i + 1), value: content.length - wsStart,
        offset: lineStart + wsStart,
        fixes: [{ start: lineStart + wsStart, end: lineStart + content.length, text: '' }],
      });
    }
    lineStart += line.length + 1;
  }
}

export default defineRule({
  id: 'trailing-whitespace',
  severity: 'warning',
  category: 'structure',
  scope: 'class',
  summary: 'a line ending in blanks — stripped by the editor, diffs forever',
  detail: 'The ABAP editor strips a trailing blank when it saves, so a line that ends in one comes back different on the next pull. It is also the round-trip defect most likely to be WRITTEN: reflowing a chain or a string template leaves blanks behind that no diff view shows. abaplint\'s `whitespace_end` owns this in repositories that enable it — and it is per repository and not everywhere, which is how seven app classes once shipped trailing blanks through four green CI workflows.',
  example: 'view->tag( `Button` )   " ← two blanks after the closing paren, invisible here',
  remedy: 'view->tag( `Button` )   " nothing after the paren; abap2ui5lint --fix trims it',
  fixNote: 'The trailing blanks are deleted, line by line — each finding carries the exact span of its own run of blanks and nothing else on the line is touched.',
  message: (f) => `line ends in ${f.value} trailing blank(s) — the ABAP editor strips them on save, so the pulled file differs from this one on every pull`,
  check,
});
