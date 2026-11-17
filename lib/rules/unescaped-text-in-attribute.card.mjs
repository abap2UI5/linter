import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unescaped-text-in-attribute',
  summary: 'a value carrying data written into the view through `v`',
  detail: 'The page bootstraps with complex binding syntax, so UI5 reads a `{` in ANY attribute value as a binding — a search string the user typed, rendered into a title, resolves as a path into the view model (or, as `{= … }`, is evaluated as an expression) instead of being shown. The builder\'s `t` parameter is the way out: `a( t = … )` applies `escape_literal( )` to the whole value, so a brace or backslash in it is shown. Reported for a value whose ORIGIN is data — a `|…|` template that interpolates, a variable or record field whose assignments in the class (`=`, `&&=`, `CONCATENATE … INTO`, `REPLACE … IN … WITH`, and through them the names they read) carry no binding vocabulary — in a statement that assembles a string, a literal holding a brace counts as vocabulary, `CONV string( )` and `name && `literal`` chains — and never for a literal, a method call, a `COND`/`SWITCH`, an ABAP boolean (`unconverted-abap-boolean`), or anything that shows a bind, an event, a wire, an `escape_literal( )` or an escaped brace: assembling a binding in a variable and passing it through `v` is what `v` is for. A value that mixes text with a binding in ONE attribute keeps `v` and escapes the text part with `z2ui5_cl_ui5_view_builder=>escape_literal( )` itself. `id` and `class` are never judged: the XML view takes both verbatim and reads no binding in them.',
  example: 'view->ele( `Page` )->a( n = `title` v = |Results for { mv_search }| )   " {/X} typed by the user is a binding',
  remedy: 'view->ele( `Page` )->a( n = `title` t = |Results for { mv_search }| )   " the builder escapes it',
  fixNote: 'The parameter is renamed — `a( v = … )` becomes `a( t = … )`; the value stays as written, the builder escapes it.',
});
