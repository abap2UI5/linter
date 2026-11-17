import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-for-property',
  summary: '`_event( )` on a property',
  detail: 'The mirror image: an event handler written into a data slot. Use `client->_bind( )`.',
  example: 'view->tag( `Text` )->a( n = `tooltip` v = client->_event( `GO` ) )',
  remedy: 'view->tag( `Text` )->a( n = `tooltip` v = client->_bind( hint ) )',
});
