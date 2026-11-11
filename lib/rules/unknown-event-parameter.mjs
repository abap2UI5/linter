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
  summary: 'a `${$parameters>/typo}` the event does not declare',
  detail: 'The parameter name is resolved against the event\'s own metadata — a name it does not declare usually arrives **empty** at `get_event_arg( )`, with no error anywhere. Judged only against an event the control declares **itself**, with a parameters block: a subclass can widen an inherited event without redeclaring it (`sap.m.DateRangeSelection` fires `change` with `from`/`to`/`valid` while the declared parameters sit on `InputBase`). A hint, not a warning, because even that is not proof — a control can fire more than its metadata declares (`ColorPickerPopover` forwards the picker\'s `change` parameters verbatim, `colorString` included, and declares none of that). The finding lists the parameters the event does declare.',
  example: `a( n = \`search\` v = client->_event( val   = \`GO\`
                                    t_arg = VALUE #( ( \`\${$parameters>/quer}\` ) ) ) )`,
  remedy: `a( n = \`search\` v = client->_event( val   = \`GO\`
                                    t_arg = VALUE #( ( \`\${$parameters>/query}\` ) ) ) )`,
  fixNote: 'Where exactly one parameter the event declares is the written name up to letter case (`Query` for `query`), the finding names it and `--fix` rewrites the name inside the `${$parameters>/…}` reference.',
  message: (f) => `${f.control} ${f.event}: the event has no parameter $parameters>/${f.member} (declared: ${[].concat(f.allowed || []).join(', ')}) — the value arrives empty` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
