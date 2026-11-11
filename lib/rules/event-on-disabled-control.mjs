import { defineRule } from '../rule.mjs';
import { memberOf } from '../ui5-meta.mjs';

function check({ data, full, node, report }) {
  /* An event handler on a control hard-disabled with a LITERAL. A
   * bound `enabled` can flip at runtime, but a literal `false` never
   * does — the control can never fire, so the handler wired next to it
   * is dead code that reads like a live wire. A hint, because a 1:1
   * port of a sample demonstrating the disabled STATE legitimately
   * carries the original's handler. Only the reconstructed builder
   * handler stub is judged (an XML view's handler names belong to a
   * controller this gate cannot see). */
  if (node.attrs.some(([n, v]) => n === 'enabled' && String(v).trim() === 'false')) {
    for (const [attr, value, at] of node.attrs) {
      if (String(value).trim().startsWith('.eB(') && memberOf(data, full, attr, ['events'])) {
        report({ control: full, member: attr, offset: at ?? node.offset });
      }
    }
  }

}

export default defineRule({
  id: 'event-on-disabled-control',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'node',
  summary: 'an event handler on a control hard-disabled with a literal',
  detail: 'A bound `enabled` can flip at runtime, but a literal `enabled="false"` never does — the control can never fire, so the handler wired next to it is dead code that reads like a live wire. A hint, because a 1:1 port of a sample demonstrating the disabled *state* legitimately carries the original\'s handler. Bind `enabled` if it should ever flip.',
  example: `)->tag( \`Button\`
    )->a( n = \`press\`   v = client->_event( \`SAVE\` )
    )->a( n = \`enabled\` v = \`false\` )   " SAVE can never fire`,
  remedy: `)->tag( \`Button\`
    )->a( n = \`press\`   v = client->_event( \`SAVE\` )
    )->a( n = \`enabled\` b = is_savable )   " bound, so it can become true`,
  message: (f) => `${f.control} wires ${f.member} but is enabled="false" as a literal — the control can never fire, so the handler is dead; bind enabled if it should ever flip`,
  check,
});
