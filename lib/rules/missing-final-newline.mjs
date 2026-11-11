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
  summary: 'no newline at end of file',
  detail: 'abapGit ends every file with exactly one terminating newline; a file without one shows as `\\ No newline at end of file` in every diff and comes back changed on the next pull (`z2ui5_if_action.intf.xml` carried exactly this). Only a source with at least one line break is judged — a one-line string handed to the library is a snippet, not a file abapGit will ever serialize.',
  example: 'ENDCLASS.   " the file ends right after the dot, with no newline',
  remedy: 'ENDCLASS.   " …followed by exactly one newline; abap2ui5lint --fix appends it',
  fixNote: 'A single newline is appended at the end of the file.',
  message: (f) => 'no newline at end of file — abapGit ends every file with exactly one, so the last line diffs on every pull',
  check,
});
