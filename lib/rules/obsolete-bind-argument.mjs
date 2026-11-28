import { defineRule, short } from '../rule.mjs';
import { parenRegion } from '../abap.mjs';

function check({ code, src, report }) {
  /* The OBSOLETE ARGUMENT on the binder itself, which the rule above cannot
   * see: it judges the METHOD, and this one is wrong on the current one.
   *
   *   view                 "obsolete - inactive, not passed on internally".
   *                        A call scoping a binding to cs_view-popup reads as
   *                        if the binding belonged to that slot; nothing
   *                        reads the value at all. Deleting it is the whole
   *                        correction and cannot change behaviour — which is
   *                        what makes it a mechanical fix rather than a guess.
   *
   * custom_mapper / custom_filter were the second case here until abap2UI5
   * removed them (1.152.0): a removed parameter is `removed-api`'s, which
   * reads it from the deprecations data with the release and the successor. */
  for (const m of code.matchAll(/client->(_bind(?:_edit)?)\s*\(/gi)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const base = open + 1;

    const vm = body.match(/\bview\s*=\s*(\S+)/i);
    if (vm) {
      const start = base + vm.index;
      let end = start + vm[0].length;
      /* Take the run of spaces behind it too, so the deletion closes up
       * instead of leaving a double gap — but never a newline, which would
       * pull the next argument onto this line. */
      while (src[end] === ' ' || src[end] === '\t') end++;
      /* A value carrying parentheses is an expression this pass does not
       * measure the end of; it is still reported, just without the fix. */
      const simple = !/[()]/.test(vm[1]);
      report({
        member: 'view', value: vm[1], offset: start,
        ...(simple ? { fixes: [{ start, end, text: '' }] } : {}),
      });
    }
  }
}

export default defineRule({
  id: 'obsolete-bind-argument',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  fixable: true,
  message: (f) => `_bind( view = ${short(f.value, 30)} ) is inactive — the argument is not passed on internally, so the binding is NOT scoped to that slot and the call only reads as if it were; delete it`,
  check,
});
