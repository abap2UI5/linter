import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-control',
  summary: '`sap.m.Shell2` — no such control',
  detail: 'The control name is not in the metadata snapshot under any known library. Almost always a typo; UI5 fails to load the class and the view never appears. A control from a custom namespace is out of scope and never reported here.',
  example: 'view->tag( `Objectstatus` )',
  remedy: 'view->tag( `ObjectStatus` )',
  fixNote: 'Where exactly one control of the same library is the written name up to letter case — or one aggregation of the owning control is, since in UI5 XML the first letter decides between the two — the finding names it and `--fix` rewrites the name in the builder call (or the XML tag). A name no single candidate matches that way is reported without a suggestion; the linter does not guess at edit distances.',
});
