import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-aggregation',
  summary: '`Page contentt` — no such aggregation',
  detail: 'An aggregation tag the parent control does not declare. UI5 then looks for a control class by that name and fails. Two more readings share the id: an aggregation tag written in a namespace other than its parent tag\'s (`<f:content>` under a `sap.m.Page` — UI5 loads it as the control `sap.f.content`), and an association written as a child tag (`<ariaLabelledBy>` — write it as an attribute).',
  example: 'view->ele( `Page` )->ele( `contentt` )->tag( `Button` )',
  remedy: 'view->ele( `Page` )->ele( `content` )->tag( `Button` )',
  fixNote: 'Where exactly one aggregation or association of the owning control is the written name up to letter case — or one control of the tag\'s own library is, since `page` under a View is `Page` with the wrong first letter — the finding names it and `--fix` rewrites the tag. Otherwise no suggestion is made.',
});
