import { defineRule } from '../rule.mjs';
import { caseMatch } from '../suggest.mjs';

function check({ data, full, p, report }) {
  const ownEvent = data[full]?.events?.[p.member];
  if (!ownEvent?.params || p.name in ownEvent.params) return;
  const suggestion = caseMatch(p.name, Object.keys(ownEvent.params));
  report({
    control: full,
    member: p.name,
    event: p.member,
    allowed: Object.keys(ownEvent.params).sort(),
    offset: p.offset,
    ...(suggestion ? { written: p.name, suggestion } : {}),
  });
}

export default defineRule({
  id: 'unknown-event-parameter',
  severity: 'hint',
  category: 'metadata',
  scope: 'node',
  fixable: true,
  message: (f) => `${f.control} ${f.event}: the event has no parameter $parameters>/${f.member} (declared: ${[].concat(f.allowed || []).join(', ')}) — the value arrives empty` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
