import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'bind-path-as-value',
  summary: 'a bare model path (`_bind_path( )`, `_bind( path = abap_true )`) written as an attribute value',
  detail: 'Both calls return the path WITHOUT its braces — `/MV_TEXT`, not `{/MV_TEXT}` — because they exist for the binding an app assembles itself: a complex binding info (`{ path: \'…\', type: … }`), an expression binding (`{= ${…} > 1 }`), a sorter. Handed to `v =` as the WHOLE value, the result is no binding at all: UI5 reads the attribute as the text `/MV_TEXT`, so a `Text` shows the path, an `Input` starts with it and writes nothing back, and a typed property — a boolean, an enum, a number — refuses the string and takes the view down. The reconstructed view carries exactly that text, which no view-side rule can tell from a literal, so the rule reads the call. Showing a path on purpose is `t =` (the text parameter), which is not judged, and XML templating\'s `template:with path="…"` — the one attribute that takes a bare path — is exempt.',
  example: 'view->tag( `Text` )->a( n = `text` v = client->_bind_path( mv_text ) )   " shows "/MV_TEXT"',
  remedy: 'view->tag( `Text` )->a( n = `text` v = client->_bind( mv_text ) )',
  fixNote: 'The call becomes the binding it was meant to be: `_bind_path( x )` is renamed to `_bind( x )`, and in `_bind( val = x path = abap_true )` the `path = abap_true` argument is deleted with the blanks in front of it. Every other argument of the call stays.',
});
