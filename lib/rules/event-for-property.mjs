import { defineRule } from '../rule.mjs';

function check({ attr, full, member, offset, value, report }) {
  /* The other half of binding-for-event: the builder writes
   * client->_event( ) as `.eB()`, and on a property, an association or an
   * aggregation that is a literal handler name shown as text. */
  const isHandler = String(value).trim().startsWith('.eB(');
  if (member.set !== 'events' && isHandler) {
    report({ control: full, member: attr, offset });
  }
}

export default defineRule({
  id: 'event-for-property',
  severity: 'error',
  category: 'bindings',
  scope: 'node',
  summary: '`_event( )` on a property',
  detail: 'The mirror image: an event handler written into a data slot. Use `client->_bind( )`.',
  example: 'view->tag( `Text` )->a( n = `tooltip` v = client->_event( `GO` ) )',
  remedy: 'view->tag( `Text` )->a( n = `tooltip` v = client->_bind( hint ) )',
  message: (f) => `${f.control} ${f.member} is a property but carries an event handler — use client->_bind( )`,
  check,
});
