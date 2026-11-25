import { defineRule } from '../rule.mjs';
import { bindingInfoPaths, bindingPath } from '../binding-paths.mjs';
import { DATA_NAME, assignedFrom, templateBindingAt } from '../abap-helpers.mjs';

/* `/SEG/NAME…` - a DDIC column with a namespace, written as it is named */
const NAMESPACED = /^\/([A-Z0-9_]+)\/[A-Z0-9_]+/;
/* what makes a variable a path the FRAMEWORK wrote (an absolute one, on
 * purpose) or one component_path( ) already made row-relative */
const FRAMEWORK_PATH = /_bind\w*\s*\(|component_path\s*\(/i;

function check({ attr, bindings, full, member, node, offset, ownerControl, rootFields, source, value, report }) {
  /* A DDIC column whose name carries a namespace (`/CWM/XCWMAT`) is written
   * into the model as a LEVEL of its row - `"CWM":{"XCWMAT":…}` - so its
   * row-relative path is `CWM/XCWMAT`. Written as it is named, the leading
   * slash makes it an absolute path from the model root: the cell renders
   * empty and an edit goes nowhere, with nothing logged (abap2UI5 40e8a073).
   *
   * Only inside a row template - a bound aggregation's clones, a
   * sap.ui.table Column.template - since a root binding is absolute on
   * purpose; only for a class (`rootFields`, null for a raw XML view, which
   * has no attributes to tell a namespace from a root field); and not where
   * the class switches its default model to an OData service, whose
   * namespaced entity sets are absolute by design. */
  if (member.set !== 'properties' || !rootFields) return;
  if (!ownerControl?.inBoundAgg && !ownerControl?.inTemplate) return;
  if (source && /switch_default_model/i.test(source)) return;

  /* 1. Literal: an absolute path of the namespace shape whose first segment
   * is NOT an attribute of the class - `{/MV_TITLE}` in a row template is
   * the documented way to show a root value per row - nor framework state
   * (`/__WINDOW/…`). A value the reconstructor had to guess is not read. */
  if (!node.guessedAttrs?.has(attr)) {
    const bp = bindingPath(value);
    const paths = bp ? [bp] : bindingInfoPaths(String(value), { composite: true }).map((p) => p.trim());
    for (const p of new Set(paths)) {
      const m = p.match(NAMESPACED);
      if (!m) continue;
      const seg = m[1];
      if (seg.startsWith('__') || rootFields.has(seg)) continue;
      if (bindings && typeof bindings === 'object' && Object.hasOwn(bindings, seg)) continue;
      report({ control: full, member: attr, value: p, kind: 'literal', offset });
    }
    return;
  }

  /* 2. Dynamic: the braces built around a column name only known at run
   * time - `|\{{ comp-name }\}|`, `|\{path:'{ comp-name }'…\}|` - right for
   * MATNR and wrong for /CWM/XCWMAT. Read off the source at the attribute
   * call, so only where the reconstructor could NOT resolve the name (a
   * literal, a constant or a variable assigned only from literals resolves,
   * and is case 1's). The embed has to be a variable or a component - a call
   * (component_path( ) above all) is not judged - and not a variable the
   * class fills from _bind( )/_bind_path( ) or from component_path( ). */
  const t = templateBindingAt(source, offset);
  if (!t || !DATA_NAME.test(t.expr)) return;
  const before = t.before.trim();
  const after = t.after.trim();
  const plain = !before && !after;
  const info = /^path\s*:\s*'$/i.test(before) && after.startsWith("'");
  if (!plain && !info) return;
  const root = t.expr.replace(/^me->/i, '');
  if (!/[-]|->/.test(root) && assignedFrom(source, root, FRAMEWORK_PATH)) return;
  report({ control: full, member: attr, value: t.expr.toLowerCase(), kind: 'dynamic', offset });
}

export default defineRule({
  id: 'namespaced-row-binding',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
  fixable: true,
  message: (f) => (f.kind === 'dynamic'
    ? `${f.control} ${f.member} builds a row binding around ${f.value} — a column with a namespace (/CWM/XCWMAT) makes it an absolute path ({/CWM/XCWMAT}), read from the model root: the cell renders empty and an edit goes nowhere. Wrap the name in z2ui5_cl_ui5_view_builder=>component_path( ), which returns the row-relative path (CWM/XCWMAT)`
    : `${f.control} ${f.member} binds {${f.value}} in a row template — a namespaced column is a level of its row, so the leading slash makes this an absolute path from the model root: the cell renders empty and an edit goes nowhere. Write it relative, {${String(f.value).slice(1)}}`),
  check,
});
