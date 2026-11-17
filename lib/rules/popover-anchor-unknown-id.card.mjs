import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'popover-anchor-unknown-id',
  summary: '`popover_display( by_id = … )` anchored to an id no view declares',
  detail: 'A popover opens **by** a control — `by_id` names its anchor. With a literal id no view of the class declares, the fragment loads, `displayPopover` finds no `openBy` control, logs it and **destroys the fragment again**: nothing opens, nothing renders red, and the property gate saw a perfectly valid fragment. Judged under the same trust condition as `frontend-action-unknown-id` — only when every `id` attribute of the class is a literal.',
  example: `)->a( n = \`id\` v = \`btnInfo\` )
" …
client->popover_display( xml = popover->stringify( ) by_id = \`btninfo\` ).`,
  remedy: `)->a( n = \`id\` v = \`btnInfo\` )
" …
client->popover_display( xml = popover->stringify( ) by_id = \`btnInfo\` ).`,
  fixNote: 'Where exactly one id a view of this class declares is the written `by_id` up to letter case, the finding names it and `--fix` rewrites the literal. Otherwise no suggestion is made.',
});
