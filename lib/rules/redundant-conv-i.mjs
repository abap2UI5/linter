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
  summary: '`CONV i( )` assigned to a target that is already `TYPE i`',
  detail: 'The assignment converts by itself, so the `CONV` says nothing and reads as if a conversion were needed; SLIN reports *"Redundant conversion for type I"*. Both halves of the scoping are load-bearing and were measured before this shipped: the target has to be declared IN THIS FILE (a type living in another class is left alone rather than guessed at), and the `CONV` has to be the ENTIRE right-hand side — one inside a comparison or an arithmetic expression is load-bearing or at least arguable, and one inside a string template (`|{ CONV i( x ) WIDTH = 2 }|`) is a real conversion. All three were false errors in the first draft. A hint: the code is correct, and this is an extended-check finding rather than a defect.',
  example: `DATA count TYPE i.
count = CONV i( lv_text ).`,
  remedy: `DATA count TYPE i.
count = lv_text.`,
  fixNote: 'The `CONV i( … )` wrapper is unwrapped to its inner expression. Safe by the rule\'s own scoping: the CONV is guaranteed to be the entire right-hand side and the target is declared `TYPE i` in this file, so the assignment performs the identical conversion by itself.',
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
