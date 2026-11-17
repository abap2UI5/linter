import { defineRule } from '../rule.mjs';

/* `name = CONV i( … ).` where `name` is TYPE i HERE - a local of the method,
 * a parameter of it, or an attribute of the class, resolved the way ABAP
 * resolves it. Both halves of the scoping are load-bearing and were
 * measured: the target has to be declared in this source (a type living in
 * another class is left alone rather than guessed at), and the CONV has to
 * be the ENTIRE right-hand side - one inside a comparison, an arithmetic
 * expression or a string template is a real conversion. */
export default defineRule({
  id: 'redundant-conv-i',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'class',
  fixable: true,
  message: (f) => `${f.member} is already TYPE i, so the assignment converts by itself — SLIN reports "Redundant conversion for type I" for the CONV`,
  check({ model, source, report }) {
    for (const s of model.statements) {
      const [name, eq, conv, type, open] = s.tokens;
      if (s.tokens.length < 6 || name.kind !== 'word' || eq.text !== '=' || conv.upper !== 'CONV') continue;
      // `i(` is written without a blank; anything else is another type's CONV
      if (type?.upper !== 'I' || open?.text !== '(' || open.start !== type.end) continue;
      const close = s.tokens[s.tokens.length - 1];
      const inner = s.tokens.slice(5, -1);
      // the CONV is the whole right-hand side: its `)` is the statement's last
      // token, and nothing inside opens a parenthesis or a template of its own
      if (close.text !== ')' || inner.some((t) => t.text === '(' || t.text === ')' || t.text.startsWith('|'))) continue;
      if (model.resolve(name.text, s.start)?.type !== 'i') continue;
      const text = source.slice(open.end, close.start);
      const unchanged = text === model.src.slice(open.end, close.start); // no comment inside
      report({
        member: name.text,
        offset: s.start,
        ...(inner.length && unchanged ? { fixes: [{ start: conv.start, end: close.end, text: text.trim() }] } : {}),
      });
    }
  },
});
