import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'redundant-conv-i',
  summary: '`CONV i( )` assigned to a target that is already `TYPE i`',
  detail: 'The assignment converts by itself, so the `CONV` says nothing and reads as if a conversion were needed; SLIN reports *"Redundant conversion for type I"*. Both halves of the scoping are load-bearing and were measured before this shipped: the target has to be declared IN THIS FILE (a type living in another class is left alone rather than guessed at), and the `CONV` has to be the ENTIRE right-hand side — one inside a comparison or an arithmetic expression is load-bearing or at least arguable, and one inside a string template (`|{ CONV i( x ) WIDTH = 2 }|`) is a real conversion. All three were false errors in the first draft. A hint: the code is correct, and this is an extended-check finding rather than a defect.',
  example: `DATA count TYPE i.
count = CONV i( lv_text ).`,
  remedy: `DATA count TYPE i.
count = lv_text.`,
  fixNote: 'The `CONV i( … )` wrapper is unwrapped to its inner expression. Safe by the rule\'s own scoping: the CONV is guaranteed to be the entire right-hand side and the target is declared `TYPE i` in this file, so the assignment performs the identical conversion by itself.',
});
