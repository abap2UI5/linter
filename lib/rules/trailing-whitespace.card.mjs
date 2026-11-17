import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'trailing-whitespace',
  summary: 'a line ending in blanks — stripped by the editor, diffs forever',
  detail: 'The ABAP editor strips a trailing blank when it saves, so a line that ends in one comes back different on the next pull. It is also the round-trip defect most likely to be WRITTEN: reflowing a chain or a string template leaves blanks behind that no diff view shows. abaplint\'s `whitespace_end` owns this in repositories that enable it — and it is per repository and not everywhere, which is how seven app classes once shipped trailing blanks through four green CI workflows.',
  example: 'view->tag( `Button` )   " ← two blanks after the closing paren, invisible here',
  remedy: 'view->tag( `Button` )   " nothing after the paren; abap2ui5lint --fix trims it',
  fixNote: 'The trailing blanks are deleted, line by line — each finding carries the exact span of its own run of blanks and nothing else on the line is touched.',
});
