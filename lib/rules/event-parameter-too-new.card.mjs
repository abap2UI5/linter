import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-parameter-too-new',
  summary: 'a `${$parameters>/name}` the event only gained later',
  detail: 'An event parameter read back in a `t_arg` that the event did not carry yet at your floor. Resolved per event, not per parameter name, so an identically named parameter on another event does not mask it.',
  example: `view->tag( \`SearchField\` )->a( n = \`search\` v = client->_event( val   = \`SEARCH\`
    t_arg = VALUE #( ( \`\${$parameters>/searchButtonPressed}\` ) ) ) )   " @since 1.114`,
  remedy: `view->tag( \`SearchField\` )->a( n = \`search\` v = client->_event( val   = \`SEARCH\`
    t_arg = VALUE #( ( \`\${$parameters>/query}\` ) ) ) )`,
});
