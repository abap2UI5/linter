import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'control-too-new',
  summary: 'control introduced after your target UI5 version',
  detail: 'The control does not exist on the system you are targeting (`--ui5`, default 1.71), so the view will not load there — however well it works on a newer one. Waive a deliberate case with `--allow sap.m.Control`.',
  example: 'view->tag( `Avatar` )   " @since 1.73, target 1.71',
  remedy: 'view->tag( `Image` )   " or raise the floor: "ui5": "1.73"',
});
