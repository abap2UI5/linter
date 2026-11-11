import { defineRule } from '../rule.mjs';

/* Called once per directive of a source, after every finding of it has
 * been through the directives: `unused` are the ids it waived nothing for
 * (null for a bare directive that waived nothing), as applyDirectives( )
 * worked them out - it alone knows which rules ran. */
function check({ directive, unused, source, report }) {
  if (!unused.length) return;
  const d = directive;
  /* The whole directive dead, on a line form: mechanical to delete -
   * the line when the comment has it to itself, else the comment. A
   * block directive keeps its -enable partner, and deleting one half
   * of a pair is a guess; so is trimming ids out of a list. */
  const whole = d.rules === null || unused.length === d.ids.length;
  const alone = source.slice(d.lineStart, d.offset).trim() === '' && source.slice(d.commentEnd, d.lineEnd).trim() === '';
  const start = alone ? d.lineStart : d.lineStart + source.slice(d.lineStart, d.offset).search(/\s*$/);
  const end = alone ? Math.min(source.length, d.lineEnd + 1) : d.commentEnd;
  report({
    member: `abap2ui5lint-${d.kind}`, value: unused.filter(Boolean).join(', '), offset: d.offset, about: d,
    ...(whole && d.kind !== 'disable' ? { fixes: [{ start, end, text: '' }] } : {}),
  });
}

export default defineRule({
  id: 'unused-directive',
  severity: 'hint',
  category: 'directives',
  scope: 'directive',
  summary: 'a `abap2ui5lint-disable…` directive that suppressed nothing',
  detail: 'The directive is in place, the rule it names never fired where it points - the code moved, the rule was tightened, or the id was never the one that reported. ESLint\'s `--report-unused-disable-directives`, on by default here for the reason the baseline refuses a stale entry: a suppression that outlives its finding hides the next real one on that line. A directive naming several ids is judged per id, a bare directive (no id, every rule) by whether it waived anything at all - and a bare directive cannot excuse its own finding, or every dead catch-all would be self-satisfied; `" abap2ui5lint-disable unused-directive`, which names the rule on purpose, may. A hint: nothing is wrong with the code, only with what the file says about it. Switch it off per repo with `"unused-directive": false` if a corpus keeps directives ahead of a rule it plans to enable.',
  example: `" abap2ui5lint-disable-next-line unknown-property
view->tag( \`Button\` )->a( n = \`type\` v = \`Emphasized\` ).`,
  remedy: 'view->tag( `Button` )->a( n = `type` v = `Emphasized` ).',
  fixNote: 'A `-disable-next-line` or `-disable-line` directive that suppressed nothing at all is deleted: the whole line when the comment has it to itself, otherwise the comment alone. A block directive (`-disable` … `-enable`) is reported without a fix, because deleting one half of the pair is a guess, and so is a directive of which only some ids are dead - trimming an id out of a list is left to the reader.',
  message: (f) => `${f.member} suppressed nothing${f.value ? ` — ${f.value} did not report ${f.member === 'abap2ui5lint-disable' ? 'inside the block' : 'on that line'}` : ''}; the code moved, the rule went quiet, or the id was never the one that fired — remove the directive`,
  check,
});
