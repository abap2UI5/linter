import { defineRule } from '../rule.mjs';

/* Called twice by checkAbapRules( ): for the events the views raise
 * (`[name, offset]` pairs) and for the backend events the KEYBOARD_SHORTCUT
 * and START_TIMER wires raise (`{ name, offset }`); both under the same
 * dynamic-handling caution, which the caller holds. */
function check({ handled, raised, report }) {
  for (const event of raised) {
    const [name, offset] = Array.isArray(event) ? event : [event.name, event.offset];
    if (!handled.has(name)) {
      report({ value: name, offset });
    }
  }
}

export default defineRule({
  id: 'event-without-handler',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  message: (f) => `event ${f.value} is raised but never handled — dead control, unless the roundtrip alone is intended`,
  check,
});
