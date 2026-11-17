import { defineRule } from '../rule.mjs';

/* Called by checkAbapSource( ) for a class written on a frozen builder
 * (`frozen`, the class builders.mjs named), which reconstructs no view and
 * is judged by this rule and obsolete-custom-control alone. */
function check({ frozen, source, report }) {
  const at = source.search(new RegExp(`\\b${frozen}\\s*=>\\s*factory`, 'i'));
  report({ value: frozen, offset: at < 0 ? 0 : at });
}

export default defineRule({
  id: 'frozen-view-builder',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `this class builds its view with ${f.value} — still fine to use, and planned to move into a separate addon rather than to disappear. It does mean no view check ran here: on z2ui5_cl_ui5_view_builder (verbs: ele, tag, a, end, stringify) the whole gate applies — controls, properties, bindings, render. Switching is recommended`,
  check,
});
