import { defineRule } from '../rule.mjs';

/* Purely structural: a CATCH statement followed by nothing before the next
 * CATCH, CLEANUP or ENDTRY. A comment does not fill the block - it is no
 * statement, and SLIN reads it the same way. */
const ENDS_THE_BLOCK = new Set(['ENDTRY', 'CATCH', 'CLEANUP']);

export default defineRule({
  id: 'empty-catch-block',
  severity: 'hint',
  category: 'structure',
  scope: 'class',
  message: (f) => `empty CATCH${f.member ? ` ${f.member}` : ''} block — the extended check (SLIN) reports it on every real system; a deliberately empty handler says so with ##NO_HANDLER on the CATCH statement`,
  check({ model, report }) {
    for (const s of model.statementsOf('CATCH')) {
      if (s.pragmas.includes('##NO_HANDLER')) continue;
      const next = model.next(s);
      if (!next || !ENDS_THE_BLOCK.has(next.keyword)) continue;
      // the first exception named, past an optional BEFORE UNWIND
      const words = s.tokens.slice(1).filter((t) => t.kind === 'word');
      const named = words[0]?.upper === 'BEFORE' && words[1]?.upper === 'UNWIND' ? words[2] : words[0];
      // dedupe carries the offset so two empty catches of the SAME exception
      // in one class stay two findings (the collapse key would merge them)
      report({ member: named?.text ?? '', dedupe: String(s.start), offset: s.start });
    }
  },
});
