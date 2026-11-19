import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'collection-bound-to-property',
  summary: 'a table or structure bound to a scalar property',
  detail: 'The property receives an object where it expects a value. Nothing throws; the control shows nothing useful. Judged only when the type is known: a table or structure the sources declare. A type they do not show - a data element, a DDIC structure, a type of a class that is not among them - is not judged; the predefined DDIC types that are a built-in underneath (`int4`, `dats`, `text40`, `flag`, the timestamps, ...) are scalars.',
  example: `DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
…
view->ele( \`Table\` )->a( n = \`headerText\` v = client->_bind( t_rows ) )`,
  remedy: `DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
…
view->ele( \`Table\` )->a( n = \`items\` v = client->_bind( t_rows ) )`,
});
