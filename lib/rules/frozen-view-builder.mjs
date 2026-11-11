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
  summary: 'the class builds its view with `z2ui5_cl_xml_view` — still supported, but no view rule can read it',
  detail: 'This is the only finding here about what was *not* judged, and it is a recommendation rather than a complaint. `z2ui5_cl_xml_view` was the abap2UI5 view builder before `z2ui5_cl_ui5_view_builder` arrived; it still compiles, still renders, and the plan is for it to move into a separate addon rather than to vanish — so an app that stays on it is making a legitimate choice. What that choice costs is this gate. The linter reconstructs a view from the current builder\'s five verbs (`ele`, `tag`, `a`, `end`, `stringify`); the old API is a different one, so there is no view to judge and every other rule stays silent for lack of anything to read — except `obsolete-custom-control`, which reads the old builder\'s `_z2ui5( )->timer( )` helpers by name. Worth saying out loud, because until this rule existed such a class was not even collected: a whole app on the old builder came back as "no checkable app classes" and exit 0, which reads like approval. Rewrite the chain on `z2ui5_cl_ui5_view_builder` and the whole gate applies again — controls, properties, bindings, render — which is the real argument for switching. Reported as a warning, not an error: nothing here is broken today. An app that is staying on the old builder for now says so once, in its config: `"rules": { "frozen-view-builder": "hint" }`, or `false` to switch it off.',
  example: `DATA(view) = z2ui5_cl_xml_view=>factory( ).   " the old builder — nothing below this line is checked
view->page( )->button( text = \`hi\` ).`,
  remedy: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( \`Page\` )->tag( \`Button\` )->a( n = \`text\` v = \`hi\` ).`,
  message: (f) => `this class builds its view with ${f.value} — still fine to use, and planned to move into a separate addon rather than to disappear. It does mean no view check ran here: on z2ui5_cl_ui5_view_builder (verbs: ele, tag, a, end, stringify) the whole gate applies — controls, properties, bindings, render. Switching is recommended`,
  check,
});
