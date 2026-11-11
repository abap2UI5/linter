import { defineRule, short } from '../rule.mjs';
import { checkPortable } from '../portable.mjs';

/* The checks themselves are checkPortable( ) in lib/portable.mjs - public
 * API of its own (`@abap2ui5/linter/portable`), run against a profile of
 * what the portable runtime supports. This rule is what the linter runs:
 * opt-in, for an ABAP class (its view nodes and its source) and for a view
 * XML document alike. */
function check({ nodes, source, abap, data, profile, report }) {
  for (const { type, ...finding } of checkPortable({ nodes, source, abap, data, profile })) report(finding);
}

export default defineRule({
  id: 'portable-app',
  severity: 'warning',
  category: 'portable',
  scope: 'app',
  optIn: true,
  summary: `outside the abap2UI5 protocol's portable profile v1 (opt-in)`,
  detail: 'Off until a config asks for it — `"rules": { "portable-app": "error" }` — because it reports no defect: an app outside the profile runs on the UI5 frontend exactly as written. What it reports is everything that keeps the app from running unchanged on a **non-UI5 frontend** too (the UI5 Web Components frontend abap2UI5/frontend-webcomponent, an Adaptive Cards renderer, an agent): the abap2UI5 protocol\'s portable profile v1 (abap2UI5/protocol `profiles/portable.md`) is the subset of the view vocabulary every portable renderer MUST render — 61 controls with their listed members, the binding forms, a restricted expression grammar, the event wires and argument descriptors, the frontend actions and the client API. The linter judges against a verbatim copy of `profiles/portable-v1.json` (`data/portable-v1.json`, source commit in `data/portable-v1.source.json`, refreshed by `npm run sync-portable-profile`). One rule id, and every finding says which part of the profile it misses: **control** (a control the profile does not list — `sap.f`, `sap.ui.table`, `sap.uxap`, MenuButton, … — or XML templating), **custom-control** (a `z2ui5.cc.*` control: bound to the UI5 runtime), **member** (a property, aggregation, event or association the profile does not list for that control, a `core:require` or a custom-data attribute), **binding** (a named model other than `device>`, an `odata` type, an app formatter, a binding-info key it does not list), **expression** (a `{= … }` construct outside the grammar: `RegExp`, `odata.*`, a call or member it does not list), **event-wire** (`prevent_default_expr`), **event-argument** (`$event`, `$controller`, a method call on a UI5 object, an event parameter or `$source` property outside the closed lists), **frontend-action** (a `follow_up_action( )` / `_event_client( )` action outside the client-API list — `CONTROL_BY_ID`, `BINDING_CALL`, the launchpad actions, custom JavaScript), **nested-view** (`nest_view_display( )` & co.: the protocol\'s decision Q1 keeps NEST/NEST2 tolerated-not-rendered in portable renderers, so a portable app must not use them) and **client-api** (`view_display( switch_default_model_path = … )`). A portable renderer shows a placeholder for an unknown control, ignores an unknown member and skips an unknown action — nothing fails, the app just looks incomplete there. Waive one class with `" abap2ui5lint-disable portable-app` at its top, or a path with the rule\'s `exclude` list.',
  example: `view->tag( \`Slider\` ).
view->tag( \`Text\` )->a( n = \`text\` v = \`{= RegExp('^A').test(\${/NAME}) }\` ).
client->nest_view_display( val = view->stringify( ) id = \`box\` method_insert = \`addItem\` ).`,
  remedy: `view->tag( \`StepInput\` ).
view->tag( \`Text\` )->a( n = \`text\` v = \`{= \${/NAME}.startsWith('A') }\` ).`,
  message: (f) => {
    const v1 = 'the portable profile v1';
    const at = f.control ? `${f.control}${f.member ? ` ${f.member}` : ''}: ` : '';
    switch (f.reason) {
      case 'control':
        return `${f.control} is not in ${v1}${f.namespace ? ` (namespace ${f.namespace} is outside it)` : ''} — a non-UI5 frontend renders a placeholder for it`;
      case 'custom-control':
        return `${f.control} is an abap2UI5 custom control (z2ui5.cc), bound to the UI5 runtime — not part of ${v1}`;
      case 'member':
        return `${f.control} ${f.kind ? `${f.kind} ` : ''}${f.member} is not in ${v1} — a portable frontend ignores it`;
      case 'binding':
        return `${at}the binding uses ${f.value}, outside the binding forms of ${v1}`;
      case 'expression':
        return `${at}the expression binding uses ${f.value}, outside the restricted grammar of ${v1} (references, literals, comparison/logic/arithmetic operators, .length, Math.max/min/abs/round/floor/ceil and six string methods)`;
      case 'event-wire':
        return `${at}the event wire ${short(f.value, 60)} is outside ${v1}`;
      case 'event-argument':
        return `${at}the event argument uses ${f.value}, outside ${v1} — bind the value two-way or pass \${REL} / \${/ABS} / a listed event parameter instead`;
      case 'frontend-action':
        return `the frontend action ${f.value} is not in the frontend actions of ${v1} — a portable frontend skips it`;
      case 'nested-view':
        return `client->${f.member}( ) displays into a nested view slot (NEST/NEST2) — portable renderers tolerate it without rendering it, so a portable app must not use it; build the content into the main view or a popup`;
      case 'client-api':
        return `client->${f.member}( ${f.value ? `${f.value} = … ` : ''}) is outside the client API of ${v1}`;
      default:
        return `outside ${v1}: ${short(f.value ?? f.control ?? f.member, 60)}`;
    }
  },
  check,
});
