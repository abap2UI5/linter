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
