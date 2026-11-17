import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'empty-catch-block',
  summary: 'an empty CATCH block without `##NO_HANDLER`',
  detail: 'The extended check (SLIN/ATC) runs in real systems, not in a systemless pipeline — so an empty handler ships through a green CI and surfaces as a finding on somebody else\'s system. `##NO_HANDLER` on the CATCH statement is how a deliberately empty handler says so. Purely structural: a CATCH statement followed by nothing before the next CATCH, CLEANUP or ENDTRY. A comment does not fill the block — SLIN reads it the same way, and the pragma is the sanctioned answer, not prose. A hint, like `redundant-conv-i`: the code is correct, the extended check is what speaks.',
  example: `TRY.
    risky( ).
  CATCH cx_root.   " SLIN: empty handler
ENDTRY.`,
  remedy: `TRY.
    risky( ).
  CATCH cx_root ##NO_HANDLER.   " deliberate, and says so
ENDTRY.`,
});
