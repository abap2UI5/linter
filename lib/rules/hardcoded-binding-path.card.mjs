import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'hardcoded-binding-path',
  summary: 'an absolute binding path written as text — `{/PATH}` or `path: \'/PATH\'`',
  detail: 'The runtime only registers what `client->_bind( )` was given, so a textual path either addresses nothing (that half is `unknown-binding-path`) or duplicates a bind that exists elsewhere — and then silently breaks the moment the attribute is renamed, because no compiler follows a string. Derive the path instead: `client->_bind( var )` for the `{binding}`, or the bare path `client->_bind_path( var )` (the readable spelling of `_bind( val = var path = abap_true )`) interpolated into a binding-info template. An OData entity path with a key predicate (`{/Products(\'4711\')}`) in a class that switches its default model to an OData service is exempt — that path addresses the service, not an ABAP variable. Only a literal that IS a value is judged — the `v = …` of an attribute call, a `&&` chain of literals included, and the rows of a `t_arg = VALUE …( )` event argument; a path quoted in a comment, a message text or any other literal binds nothing and is not reported.',
  example: 'a( n = `title` v = `{/TITLE}` )   " breaks on rename',
  remedy: 'a( n = `title` v = client->_bind( title ) )   " moves with the variable',
  fixNote: 'A value that is exactly the literal `{/NAME}`, where NAME is a PUBLIC attribute of the class, is rewritten to `client->_bind( name )`. A path with segments, a binding-info string or a literal with other text around the path is reported without a fix.',
});
