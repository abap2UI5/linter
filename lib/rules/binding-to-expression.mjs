import { defineRule, short } from '../rule.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';

function check({ code, src, report }) {
  /* A `_bind( )` on something that is no attribute at all - a literal, a
   * method call, a constructor expression, a concatenation. The framework
   * takes `val` by reference and looks the reference up among the app's
   * attributes to derive the model path; a temporary is found nowhere, and
   * the bind raises at runtime. The neighbours above judge a variable that
   * IS one (a local, a non-public attribute); this one judges a value that
   * never was. A table expression (`t[ 1 ]-x`) and a dereference (`r->*`)
   * are left alone: those address data the serializer can walk. */
  for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(/gi)) {
    const { body } = parenRegion(src, m.index + m[0].length - 1);
    if (body === undefined) continue;
    const marks = namedArgMarks(body);
    const val = marks.length ? marks.find((a) => a.name === 'val')?.value : body.trim();
    if (!val) continue;
    const kind = /^(?:[`'|]|\d)/.test(val) ? 'literal'
      : /^(?:VALUE|CONV|NEW|CAST|REF|COND|SWITCH|CORRESPONDING|EXACT|REDUCE|FILTER)\s+[#\w]*\s*\(/i.test(val) ? 'constructor'
        : /^[\w=>-]+\s*\(/.test(val) && !/^[\w=>-]+\s*\[/.test(val) ? 'call'
          : /&&/.test(val) ? 'expression' : null;
    if (!kind) continue;
    report({ member: kind, value: val.replace(/\s+/g, ' ').slice(0, 40), offset: m.index });
  }
}

export default defineRule({
  id: 'binding-to-expression',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  summary: '`_bind( )` on a literal, a method call or an expression — nothing to derive a path from',
  detail: 'The framework takes `val` by reference and looks that reference up among the app\'s attributes to derive the model path. A literal, a method result, a constructor expression or a concatenation is a temporary that is found nowhere, and the bind raises at runtime — on the first display, with an exception naming no attribute. The neighbours `binding-to-local` and `binding-to-nonpublic` judge a variable that IS an attribute of the wrong kind; this one judges a value that never was one. A table expression (`t[ 1 ]-x`) and a dereference (`r->*`) are left alone — those address data the serializer can walk. The way out is always the same: put the value in a PUBLIC attribute and bind that.',
  example: 'view->tag( `Text` )->a( n = `text` v = client->_bind( get_title( ) ) )   " a temporary - no path',
  remedy: `DATA title TYPE string.
view->tag( \`Text\` )->a( n = \`text\` v = client->_bind( title ) )`,
  message: (f) => `_bind( ) on ${f.member === 'literal' ? 'a literal' : f.member === 'call' ? 'a method call' : f.member === 'constructor' ? 'a constructor expression' : 'an expression'} (${short(f.value, 40)}) — the framework derives the model path from the ATTRIBUTE it is handed, and this is not one: the bind throws at runtime. Put the value in a PUBLIC attribute and bind that`,
  check,
});
