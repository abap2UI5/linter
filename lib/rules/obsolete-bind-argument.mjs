import { defineRule, short } from '../rule.mjs';
import { parenRegion } from '../abap.mjs';

function check({ code, src, report }) {
  /* Two OBSOLETE ARGUMENTS on the binder itself, which the rule above cannot
   * see: it judges the METHOD, and these are wrong on the current one.
   *
   *   view                 "obsolete - inactive, not passed on internally".
   *                        A call scoping a binding to cs_view-popup reads as
   *                        if the binding belonged to that slot; nothing
   *                        reads the value at all. Deleting it is the whole
   *                        correction and cannot change behaviour — which is
   *                        what makes it a mechanical fix rather than a guess.
   *   custom_mapper /      "obsolete - still evaluated, but do not use in new
   *   custom_filter        code". Both hand the app a reference to the BUNDLED
   *                        AJSON copy in src/00 — a mirror of an external
   *                        project, not a contract this framework owns — so an
   *                        app implementing the interface binds itself to
   *                        whatever that mirror looks like today. It is the
   *                        `non-released-api` argument one level down, at a
   *                        parameter instead of a class name. No fix: they are
   *                        still evaluated, so dropping one changes what the
   *                        model carries. The declarative replacements are
   *                        omit_initial / omit_initial_paths / json.
   *
   * Only `_bind` is scanned for the mapper pair: on `_bind_edit` the whole
   * call is already reported by `obsolete-binder` above, and two findings for
   * one line is one too many. */
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

    if (m[1].toLowerCase() === '_bind') {
      const cm = body.match(/\bcustom_(?:mapper|filter)\b/i);
      if (cm) {
        report({ member: cm[0], offset: base + cm.index });
      }
    }
  }
}

export default defineRule({
  id: 'obsolete-bind-argument',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: '`_bind( view = … )` and the `custom_mapper`/`custom_filter` pair',
  detail: 'Two arguments the binder still ACCEPTS and should no longer be given. `view` is "inactive, not passed on internally": a call scoping a binding to `cs_view-popup` reads as if the binding belonged to that slot, and nothing reads the value at all — so it is dead weight that documents a behaviour the framework does not have. `custom_mapper` and `custom_filter` are the opposite, and worse: they are still evaluated, but both hand the app a reference to the AJSON copy bundled in `src/00` — a mirror of an external project, not a contract abap2UI5 owns — so an app implementing `z2ui5_if_ajson_mapping`/`_filter` binds itself to whatever that mirror looks like today. That is the `non-released-api` argument one level down, at a parameter rather than a class name. Everything they were reached for is declarative on the method now: `omit_initial`/`omit_initial_paths` drop initial fields and `json` splices a JSON node.',
  example: 'a( n = `value` v = client->_bind( val = name view = client->cs_view-popup ) )',
  remedy: 'a( n = `value` v = client->_bind( name ) )',
  fixNote: 'The inactive `view` argument is deleted, together with the spaces behind it; a value carrying parentheses is an expression whose end this pass does not measure and is reported without a fix. The mapper pair never carries one — they are still evaluated, so dropping one changes what the model carries.',
  message: (f) => {
    return f.member === 'view'
      ? `_bind( view = ${short(f.value, 30)} ) is inactive — the argument is not passed on internally, so the binding is NOT scoped to that slot and the call only reads as if it were; delete it`
      : `_bind( ${f.member} = … ) is obsolete — it hands the app a reference to the AJSON copy bundled in src/00, which is a mirrored external project rather than a released contract; omit_initial/omit_initial_paths and json do the same declaratively`;
  },
  check,
});
