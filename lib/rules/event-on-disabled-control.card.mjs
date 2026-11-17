import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-on-disabled-control',
  summary: 'an event handler on a control hard-disabled with a literal',
  detail: 'A bound `enabled` can flip at runtime, but a literal `enabled="false"` never does — the control can never fire, so the handler wired next to it is dead code that reads like a live wire. A hint, because a 1:1 port of a sample demonstrating the disabled *state* legitimately carries the original\'s handler. Bind `enabled` if it should ever flip.',
  example: `)->tag( \`Button\`
    )->a( n = \`press\`   v = client->_event( \`SAVE\` )
    )->a( n = \`enabled\` v = \`false\` )   " SAVE can never fire`,
  remedy: `)->tag( \`Button\`
    )->a( n = \`press\`   v = client->_event( \`SAVE\` )
    )->a( n = \`enabled\` b = is_savable )   " bound, so it can become true`,
});
