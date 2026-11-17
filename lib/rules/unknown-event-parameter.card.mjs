import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-event-parameter',
  summary: 'a `${$parameters>/typo}` the event does not declare',
  detail: 'The parameter name is resolved against the event\'s own metadata — a name it does not declare usually arrives **empty** at `get_event_arg( )`, with no error anywhere. Judged only against an event the control declares **itself**, with a parameters block: a subclass can widen an inherited event without redeclaring it (`sap.m.DateRangeSelection` fires `change` with `from`/`to`/`valid` while the declared parameters sit on `InputBase`). A hint, not a warning, because even that is not proof — a control can fire more than its metadata declares (`ColorPickerPopover` forwards the picker\'s `change` parameters verbatim, `colorString` included, and declares none of that). The finding lists the parameters the event does declare.',
  example: `a( n = \`search\` v = client->_event( val   = \`GO\`
                                    t_arg = VALUE #( ( \`\${$parameters>/quer}\` ) ) ) )`,
  remedy: `a( n = \`search\` v = client->_event( val   = \`GO\`
                                    t_arg = VALUE #( ( \`\${$parameters>/query}\` ) ) ) )`,
  fixNote: 'Where exactly one parameter the event declares is the written name up to letter case (`Query` for `query`), the finding names it and `--fix` rewrites the name inside the `${$parameters>/…}` reference.',
});
