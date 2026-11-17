import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'sapui5-only-control',
  summary: 'needs SAPUI5, absent from OpenUI5',
  detail: 'SAPUI5 ships libraries OpenUI5 does not — `sap.ui.comp` (Smart controls), `sap.suite.*`, `sap.ushell`, `sap.fe`, `sap.viz` — so a SmartTable is fine on SAPUI5 and a guaranteed runtime error on OpenUI5. The severity therefore follows what your config says about the target, and this is the only rule of which that is true: with `--distribution openui5` (or `"distribution": "openui5"`) it is an **error**, because the library provably is not there; with `--distribution sapui5` it is not reported at all, because you have said it is; and with no `distribution` configured it is a **hint** — the linter does not know which system the app deploys to, and a control only one distribution ships is worth knowing about either way. Configure `distribution` to turn the hint into the answer your repository actually needs.',
  example: 'view->tag( n = `SmartTable` ns = `smart` )   " sap.ui.comp: SAPUI5 only',
  remedy: 'view->ele( `Table` )   " sap.m, in OpenUI5 too; or declare "distribution": "sapui5"',
});
