import { defineRule } from '../rule.mjs';
import { isBinding } from '../ui5-meta.mjs';

function check({ attr, full, member, offset, value, report }) {
  /* The builder substitutes client->_event( ) as `.eB()` and
   * client->_bind( ) as a binding, so mixing the two up is visible
   * here: an event carrying data, or a property carrying a handler.
   * Both are silent at runtime - a dead button, or a literal
   * handler name shown as text. */
  const isHandler = String(value).trim().startsWith('.eB(');
  if (member.set === 'events' && !isHandler && isBinding(value)) {
    report({ control: full, member: attr, offset });
  }
}

export default defineRule({
  id: 'binding-for-event',
  severity: 'error',
  category: 'bindings',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} is an event but carries a binding — use client->_event( )`,
  check,
});
