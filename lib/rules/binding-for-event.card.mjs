import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'binding-for-event',
  summary: '`_bind( )` on an event — a dead control',
  detail: 'The slot is an event, so a data binding in it never becomes a handler. The control renders and does nothing. Use `client->_event( )`.',
  example: 'view->tag( `Button` )->a( n = `press` v = client->_bind( name ) )',
  remedy: 'view->tag( `Button` )->a( n = `press` v = client->_event( `SAVE` ) )',
});
