import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'escaped-brace-in-backtick',
  summary: 'a binding written with escaped braces inside a `backtick` literal',
  detail: 'Brace escaping is a |…| TEMPLATE rule. In a template the backslash is ABAP\'s own escape, so `\\{` reaches the builder as a bare `{` — which is exactly what a binding needs. A `backtick` literal has no escape processing at all: the backslash is taken verbatim and lands in the serialized attribute, where UI5 reads `\\{ path: … \\}` as text rather than a binding and either renders it raw or fails to parse the view. Write plain braces in a backtick literal; keep the escapes for the template form.',
  example: 'a( n = `items` v = `\\{ path: \'message>/\' \\}` )   " the backslash reaches the XML',
  remedy: 'a( n = `items` v = `{ path: \'message>/\' }` )   " correct in a backtick literal',
  fixNote: 'Every backslash in front of a brace inside the backtick literal is deleted, leaving the plain-brace form the literal should have carried. Nothing else in the literal is touched — a backtick literal has no escape processing, so the backslashes say nothing.',
});
