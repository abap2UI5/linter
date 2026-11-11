import { defineRule, short } from '../rule.mjs';
import { publicAttributes } from '../abap-helpers.mjs';
import { clientCalls, namedArgMarks, parenRegion } from '../abap.mjs';

function check({ d, src, report }) {
  /* An absolute binding path written as TEXT — `{/PATH}` in a literal, or
   * `path: '/PATH'` in a binding-info string. The runtime only registers what
   * client->_bind( ) was given, so a textual path either addresses nothing
   * (caught as unknown-binding-path) or duplicates a bind that exists — and
   * then silently breaks the moment the attribute is renamed, because no
   * compiler follows a string. Derive it instead: client->_bind( var ), or
   * the bare-path form `_bind( val = var path = abap_true )` interpolated
   * into the binding-info template.
   *
   * Two shapes stay out: an OData ENTITY path with a key predicate
   * (`{/Products('4711')}`) in a class that switches its default model to an
   * OData service — that path addresses the service, not an ABAP variable,
   * so there is nothing to derive it from. And anything between <style> and
   * </style>, where `{/` is a CSS brace meeting a CSS comment, not a path. */
  const odata = /switch_default_model_path/i.test(src);
  const PATH = /\{\/[^}\n]{0,60}\}?|\bpath\s*:\s*'(\/[^'\n]{0,60})'?/g;
  const seen = new Set();
  /* Only a literal that IS a value is judged: the `v = …` of an attribute
   * call (a `&&` chain of literals included) and the rows of a `t_arg =
   * VALUE …( ( … ) )` event argument. Read over the whole source, the rule
   * fired on prose - every one of the 18 corpus findings was a sentence in
   * a documentation class explaining a two-way binding - and the class that
   * paid for it switched the rule off. A path in a comment or a message
   * text binds nothing. */
  /* The fix, for the one shape that is mechanical: a value that IS the
   * literal `{/NAME}` and nothing else, where NAME is a PUBLIC attribute
   * of this class - rewritten to `client->_bind( name )`, which derives
   * the same path. A path with segments, a binding-info string, a
   * literal sharing its value with other text: reported without a fix. */
  const publicNames = new Set(publicAttributes(src).map((a) => a.name.toUpperCase()));
  // the handle of the first `…client->_bind( ` call, `me->` included
  const handle = clientCalls(src, (method) => method === '_bind').next().value?.handle ?? 'client';
  const bindFixFor = (lit) => {
    const whole = lit.text.match(/^([`'])\{\/(\w+)\}\1$/);
    if (!whole || !publicNames.has(whole[2].toUpperCase())) return null;
    return [{ start: lit.at, end: lit.at + lit.text.length, text: `${handle}->_bind( ${whole[2].toLowerCase()} )` }];
  };
  const judge = (literal, at, member, fixes = null) => {
    /* The <style> exemption, kept where the literals are judged: a sheet
     * written as a value (`core:HTML`'s `content`) is CSS, and `\{/* brand
     * *\/` in it is an escaped brace meeting a CSS comment. The same holds
     * for an escaped brace anywhere - `\{/` is never a binding. */
    if (/<style\b/i.test(literal)) return;
    for (const m of literal.matchAll(PATH)) {
      const text = m[0];
      if (text.startsWith('{') && m.index > 0 && literal[m.index - 1] === '\\') continue;
      if (odata && /^(?:\{|path\s*:\s*')\/\w+\([^)]*\)/.test(text)) continue;
      const offset = at + m.index;
      if (seen.has(offset)) continue;
      seen.add(offset);
      report({ member, value: text.slice(0, 40), offset, ...(fixes ? { fixes } : {}) });
    }
  };
  // the literals of a value expression: LIT, or LIT && LIT && …
  const literalsIn = (text, base) => {
    const out = [];
    for (const m of text.matchAll(/`([^`]*)`|'((?:[^']|'')*)'|\|((?:[^|\\]|\\.)*)\|/g)) {
      out.push({ text: m[0], at: base + m.index });
    }
    return out;
  };
  for (const m of src.matchAll(new RegExp(`->\\s*(?:${d.att})\\s*\\(`, 'gi'))) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    const marks = namedArgMarks(body);
    const vArg = marks.find((a) => a.name === 'v');
    if (!vArg) continue;
    const nArg = marks.find((a) => a.name === 'n');
    const member = nArg?.value.match(/^[`'|]([\w:]+)[`'|]$/)?.[1];
    // a value that is not a literal chain is derived from something - a
    // variable, a _bind( ) - and nothing textual is hard-coded in it
    if (!/^(?:`[^`]*`|'(?:[^']|'')*'|\|(?:[^|\\]|\\.)*\|)(?:\s*&&\s*(?:`[^`]*`|'(?:[^']|'')*'|\|(?:[^|\\]|\\.)*\|))*$/.test(vArg.value)) continue;
    const lits = literalsIn(vArg.value, open + 1 + vArg.vstart);
    for (const lit of lits) judge(lit.text, lit.at, member, lits.length === 1 ? bindFixFor(lit) : null);
  }
  for (const m of src.matchAll(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/gi)) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    for (const lit of literalsIn(body, open + 1)) judge(lit.text, lit.at, 't_arg');
  }
}

export default defineRule({
  id: 'hardcoded-binding-path',
  severity: 'warning',
  category: 'bindings',
  scope: 'app',
  summary: 'an absolute binding path written as text — `{/PATH}` or `path: \'/PATH\'`',
  detail: 'The runtime only registers what `client->_bind( )` was given, so a textual path either addresses nothing (that half is `unknown-binding-path`) or duplicates a bind that exists elsewhere — and then silently breaks the moment the attribute is renamed, because no compiler follows a string. Derive the path instead: `client->_bind( var )` for the `{binding}`, or the bare path `client->_bind_path( var )` (the readable spelling of `_bind( val = var path = abap_true )`) interpolated into a binding-info template. An OData entity path with a key predicate (`{/Products(\'4711\')}`) in a class that switches its default model to an OData service is exempt — that path addresses the service, not an ABAP variable. Only a literal that IS a value is judged — the `v = …` of an attribute call, a `&&` chain of literals included, and the rows of a `t_arg = VALUE …( )` event argument; a path quoted in a comment, a message text or any other literal binds nothing and is not reported.',
  example: 'a( n = `title` v = `{/TITLE}` )   " breaks on rename',
  remedy: 'a( n = `title` v = client->_bind( title ) )   " moves with the variable',
  fixNote: 'A value that is exactly the literal `{/NAME}`, where NAME is a PUBLIC attribute of the class, is rewritten to `client->_bind( name )`. A path with segments, a binding-info string or a literal with other text around the path is reported without a fix.',
  message: (f) => `an absolute binding path is written as text (${short(f.value, 40)}) — derive it from client->_bind( var ) (bare path: client->_bind_path( var )) so it moves with a variable rename`,
  check,
});
