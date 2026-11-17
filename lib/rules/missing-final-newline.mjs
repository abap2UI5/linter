import { defineRule } from '../rule.mjs';

/* abapGit ends every file with exactly one newline (abap-check §1). Only a
 * source that HAS lines is judged: a one-line string is a snippet handed to
 * the library, not a file abapGit will ever serialize. */
function check({ source, report }) {
  if (source.includes('\n') && !source.endsWith('\n')) {
    report({ offset: source.length - 1, fixes: [{ start: source.length, end: source.length, text: '\n' }] });
  }
}

export default defineRule({
  id: 'missing-final-newline',
  severity: 'warning',
  category: 'structure',
  scope: 'class',
  fixable: true,
  message: (f) => 'no newline at end of file — abapGit ends every file with exactly one, so the last line diffs on every pull',
  check,
});
