import { defineRule } from '../rule.mjs';
import { parenRegion } from '../abap.mjs';

function check({ code, src, report }) {
  /* _bind_edit is obsolete - _bind is two-way as well, and _bind_edit is a
   * pure alias for it now. The one exception this rule used to make is gone
   * with the parameters it was made for: custom_mapper_back /
   * custom_filter_back are still ACCEPTED for source compatibility but no
   * longer evaluated ("per-direction mapping is gone"), so a call passing one
   * is no longer the only way to say what it says - it says nothing. It is
   * reported like every other, but without the fix: dropping an argument is
   * not a rename, and _bind has no parameter to rename it to. */
  for (const m of code.matchAll(/client->(_bind_edit)\s*\(/gi)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    const back = body.match(/\bcustom_(?:mapper|filter)_back\b/i);
    // autofixable where the call is identical apart from the method name
    const token = m.index + m[0].indexOf(m[1]);
    report({
      member: m[1], value: back?.[0], offset: m.index,
      ...(back ? {} : { fixes: [{ start: token, end: token + m[1].length, text: '_bind' }] }),
    });
  }
}

export default defineRule({
  id: 'obsolete-binder',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  fixable: true,
  message: (f) => {
    return f.value
      ? `client->${f.member}( ) is obsolete — use client->_bind( ); ${f.value} is still accepted for source compatibility but no longer evaluated, so drop it along with the rename`
      : `client->${f.member}( ) is obsolete — use client->_bind( )`;
  },
  check,
});
