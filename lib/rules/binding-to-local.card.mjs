import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'binding-to-local',
  summary: 'a local variable bound',
  detail: 'The instance is serialized across the roundtrip, the method stack is not — so the value is gone when the answer comes back. Bind an instance attribute.',
  example: `METHOD z2ui5_if_app~main.
  DATA lv_title TYPE string.
  view->tag( \`Text\` )->a( n = \`text\` v = client->_bind( lv_title ) ).   " gone after the roundtrip
ENDMETHOD.`,
  remedy: `PUBLIC SECTION.
  DATA title TYPE string.
" …
  view->tag( \`Text\` )->a( n = \`text\` v = client->_bind( title ) ).`,
});
