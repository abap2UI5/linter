import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'collection-bound-to-property',
  summary: 'a table or structure bound to a scalar property',
  detail: 'The property receives an object where it expects a value. Nothing throws; the control shows nothing useful.',
  example: `DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
…
view->ele( \`Table\` )->a( n = \`headerText\` v = client->_bind( t_rows ) )`,
  remedy: `DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
…
view->ele( \`Table\` )->a( n = \`items\` v = client->_bind( t_rows ) )`,
});
