import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'binding-to-expression',
  summary: '`_bind( )` on a literal, a method call or an expression — nothing to derive a path from',
  detail: 'The framework takes `val` by reference and looks that reference up among the app\'s attributes to derive the model path. A literal, a method result, a constructor expression or a concatenation is a temporary that is found nowhere, and the bind raises at runtime — on the first display, with an exception naming no attribute. The neighbours `binding-to-local` and `binding-to-nonpublic` judge a variable that IS an attribute of the wrong kind; this one judges a value that never was one. A table expression (`t[ 1 ]-x`) and a dereference (`r->*`) are left alone — those address data the serializer can walk. The way out is always the same: put the value in a PUBLIC attribute and bind that.',
  example: 'view->tag( `Text` )->a( n = `text` v = client->_bind( get_title( ) ) )   " a temporary - no path',
  remedy: `DATA title TYPE string.
view->tag( \`Text\` )->a( n = \`text\` v = client->_bind( title ) )`,
});
