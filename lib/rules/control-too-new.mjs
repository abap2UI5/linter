import { defineRule } from '../rule.mjs';
import { withinFloor } from '../ui5-meta.mjs';

function check({ floor, full, meta, minUi5, node, report }) {
  if (meta.since && !withinFloor(meta.since, floor)) {
    report({ control: full, since: meta.since, minUi5, offset: node.offset });
  }
}

export default defineRule({
  id: 'control-too-new',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: 'control introduced after your target UI5 version',
  detail: 'The control does not exist on the system you are targeting (`--ui5`, default 1.71), so the view will not load there — however well it works on a newer one. Waive a deliberate case with `--allow sap.m.Control`.',
  example: 'view->tag( `Avatar` )   " @since 1.73, target 1.71',
  remedy: 'view->tag( `Image` )   " or raise the floor: "ui5": "1.73"',
  message: (f) => `control ${f.control} is @since ${f.since} — newer than the ${f.minUi5} floor`,
  check,
});
