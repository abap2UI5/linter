import { defineRule, short } from '../rule.mjs';
import { deprecationApplies, deprecationSince, deprecationWithinHorizon, replacementOf } from '../ui5-meta.mjs';

function check({ data, floor, full, horizon, meta, node, reportAfterTarget, report }) {
  // deprecated only counts when it already applies to the TARGET
  // version: a control deprecated as of 1.149 is perfectly fine for a
  // 1.71 system, and warning about it would be noise
  if (meta.deprecated && deprecationApplies(meta.deprecated, floor)) {
    report({ control: full, deprecated: meta.deprecated, offset: node.offset });
  } else if (meta.deprecated && deprecationWithinHorizon(meta.deprecated, horizon)) {
    reportAfterTarget({
      kind: 'control', control: full, since: deprecationSince(meta.deprecated),
      deprecated: meta.deprecated, offset: node.offset,
    }, replacementOf(data, full, meta.deprecated));
  }

}

export default defineRule({
  id: 'control-deprecated',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: 'control already deprecated at your target version',
  detail: 'Reported only once the deprecation is in effect at the version you target — a control deprecated as of 1.149 stays silent for a 1.71 target.',
  example: 'view->tag( `DateTimeInput` )   " deprecated as of 1.32.8',
  remedy: 'view->tag( `DateTimePicker` )',
  message: (f) => `control ${f.control} is deprecated (${short(f.deprecated?.text || f.deprecated)})`,
  check,
});
