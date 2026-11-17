import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'missing-final-newline',
  summary: 'no newline at end of file',
  detail: 'abapGit ends every file with exactly one terminating newline; a file without one shows as `\\ No newline at end of file` in every diff and comes back changed on the next pull (`z2ui5_if_action.intf.xml` carried exactly this). Only a source with at least one line break is judged — a one-line string handed to the library is a snippet, not a file abapGit will ever serialize.',
  example: 'ENDCLASS.   " the file ends right after the dot, with no newline',
  remedy: 'ENDCLASS.   " …followed by exactly one newline; abap2ui5lint --fix appends it',
  fixNote: 'A single newline is appended at the end of the file.',
});
