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
  fixable: true,
  message: (f) => `${f.member} suppressed nothing${f.value ? ` — ${f.value} did not report ${f.member === 'abap2ui5lint-disable' ? 'inside the block' : 'on that line'}` : ''}; the code moved, the rule went quiet, or the id was never the one that fired — remove the directive`,
  check,
});
