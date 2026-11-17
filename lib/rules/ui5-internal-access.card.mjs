import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'ui5-internal-access',
  summary: '`mProperties` & friends, `$event.oSource.sId` — private UI5 internals',
  detail: 'The `mProperties`/`mAggregations`/`mBindingInfos`/`mEventRegistry` member tables are UI5 implementation details with no API contract — they are renamed or restructured across UI5 patches without notice, so a wire or expression that reads them works on the version it was written against and breaks silently on the next one. Restructure to a two-way binding or a public parameter: a `control_by_id` wire that names `mProperties` calls a public method instead (`getVisible`). The same holds for the private FIELDS of a UI5 object that a client expression walks: UI5 names them the Hungarian way, a lower-case type letter and then the name (`$event.oSource.sId`, `$event.mParameters`, `….oParent`). An event argument or a frontend-action argument that reads one works because the field is there in this release; a release that renames it breaks the wire with nothing raised. Those fields are read only inside literals that are client expressions (they name `$event`, `$source`, `$parameters`, `$controller` or open a `${` binding), and only as property reads — a member followed by `(` is a method call.',
  example: 'client->_event( val = `PRESS` arg = `$event.oSource.sId` )',
  remedy: 'client->_event( val = `PRESS` arg = `$event.getSource().getId()` )',
  fixNote: 'A private field read in a client expression is rewritten to its public getter inside the literal, for the four the corpora read: `oSource` to `getSource()`, `sId` to `getId()`, `mParameters` to `getParameters()`, `oParent` to `getParent()` — `$event.oSource.sId` becomes `$event.getSource().getId()`. Any other private field and the member tables keep the finding without a fix: what replaces them depends on what the wire wanted.',
});
