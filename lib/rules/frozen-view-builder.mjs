import { defineRule } from '../rule.mjs';
import { objectDeprecation } from '../deprecations.mjs';

/* Called by checkAbapSource( ) for a class written on a frozen builder
 * (`frozen`, the class builders.mjs named), which reconstructs no view: no
 * view rule runs on it. It is still judged by the rules that read the class
 * and not the view - check.mjs says which.
 *
 * Where the builder is today is the documentation's fact, not this file's:
 * the release and the repository come from the vendored deprecations
 * (lib/deprecations.mjs). It said "planned to move into a separate addon"
 * here for months after 1.151.0 had moved it. */
function check({ frozen, source, report }) {
  const at = source.search(new RegExp(`\\b${frozen}\\s*=>\\s*factory`, 'i'));
  const moved = objectDeprecation(frozen)?.entry;
  report({
    value: frozen,
    ...(moved?.status === 'moved' ? { since: moved.since, movedTo: moved.movedTo } : {}),
    offset: at < 0 ? 0 : at,
  });
}

export default defineRule({
  id: 'frozen-view-builder',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `this class builds its view with ${f.value} — ${f.movedTo
    ? `frozen, and since abap2UI5 ${f.since} no longer part of the framework: it was moved to github.com/${f.movedTo} and compiles only where that repository is installed next to abap2UI5`
    : 'the frozen predecessor of the current view builder'}. It also means no view check ran here: on z2ui5_cl_ui5_view_builder (verbs: ele, tag, a, end, stringify) the whole gate applies — controls, properties, bindings, render. Switching is recommended`,
  check,
});
