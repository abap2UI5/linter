import { defineRule } from '../rule.mjs';
import { relativePath } from '../binding-paths.mjs';
import { DATA_NAME, assignedFrom, templateBindingAt } from '../abap-helpers.mjs';

/* `{ path: 'TYPE' }` and nothing else in the binding info - a formatter, a
 * type or a second key makes it something this rule does not judge */
const PATH_ONLY = /^\{\s*path\s*:\s*'([A-Za-z_]\w*(?:\/\w+)*)'\s*\}$/;
/* a variable the framework filled with a ROOT path (`/MT_ROWS/0`) addresses
 * no row of the template */
const ROOT_PATH = /_bind\w*\s*\(/i;
const COMPONENT_PATH = /^z2ui5_cl_ui5_view_builder\s*=>\s*component_path\s*\(\s*[\w>-]+\s*\)$/i;

/* the value a fallback names: the property's own default where the snapshot
 * has one that is a member, else the enum's neutral `Default` or `None`,
 * else its first value - only the message names it */
const fallbackOf = (decl, values) => [decl?.defaultValue, 'Default', 'None'].find((v) => values.includes(v)) ?? values[0];

/* whether a row of KNOWN shape (a structure the class declares) lacks the
 * path; an opaque or unknown row lacks nothing */
function missingIn(row, path) {
  let cur = row;
  for (const seg of path.split('/')) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur) || cur.__unknownShape) return false;
    if (!(seg in cur)) return Boolean(cur.__complete);
    cur = cur[seg];
  }
  return false;
}

function check({ attr, ctx, enums, full, member, node, offset, ownerControl, source, value, report }) {
  /* An enum-typed property (ButtonType, SwitchType, ValueState, ValueColor,
   * …) bound straight to a column of a bound table. The cell gets whatever
   * the ABAP row holds, and an initial field is "" (or 0, or false): no
   * member of the enum. A binding is not parsed - ManagedObject
   * validateProperty calls the enum's isValid( ) alone, which tests
   * membership in the values - so it throws, ManagedObjectBindingSupport
   * rethrows everything but a FormatException, and the whole view fails to
   * render (abap2UI5-addons/layout-management a6da435).
   *
   * Which enums accept "" is read off the snapshot, not listed: an enum is
   * spared when one of its VALUES is the empty string. None of the
   * snapshot's is (UI5 1.71 to today), so today every enum is judged - the
   * check is still the snapshot's, should one ever carry "".
   *
   * Only a ROW binding: a plain relative `{TYPE}` (or `{ path: 'TYPE' }`)
   * under a bound aggregation or a sap.ui.table row template. A root binding
   * is the app's own attribute, which the start-path rules
   * (enum-bound-to-initial-field) judge; an expression binding or a
   * formatter is the fallback this asks for; a literal is judged as a value. */
  if (member.set !== 'properties') return;
  const values = enums?.[member.decl?.type];
  if (!values || values.includes('')) return;
  if (!ownerControl?.inBoundAgg && !ownerControl?.inTemplate) return;
  if (!node.guessedAttrs?.has(attr)) {
    const v = String(value).trim();
    const path = relativePath(v) ?? v.match(PATH_ONLY)?.[1];
    /* A path that reaches no field resolves to undefined, and UI5 then keeps
     * the property's default - no throw, and unknown-binding-path's finding.
     * A lower-case letter is no ABAP component name (`{Text}`, a demo-kit
     * path ported verbatim); a row whose shape the class declares says
     * which fields it has. */
    if (!path || /[a-z]/.test(path) || missingIn(ctx?.row, path)) return;
    report({ control: full, member: attr, value: path, memberType: member.decl.type, fallback: fallbackOf(member.decl, values), offset });
    return;
  }
  /* The same binding built at run time - `|\{{ path }/TYPE\}|`, the
   * generic table builder's shape: the reconstructor cannot resolve it, so
   * it is read off the source at the attribute call. The embed is a
   * variable, a component or component_path( ) of one (the row-relative
   * column), and not a variable the class fills from _bind( ), whose path is
   * absolute. */
  const t = templateBindingAt(source, offset);
  if (!t || t.before.trim()) return;
  const after = t.after.trim();
  if (after && !/^\/[A-Za-z_]\w*(?:\/\w+)*$/.test(after)) return;
  const named = DATA_NAME.test(t.expr);
  if (!named && !COMPONENT_PATH.test(t.expr)) return;
  if (named && !/-/.test(t.expr) && assignedFrom(source, t.expr.replace(/^me->/i, ''), ROOT_PATH)) return;
  report({
    control: full, member: attr, value: `|\\{{ ${t.expr.replace(/\s+/g, ' ').toLowerCase()} }${after}\\}|`, dynamic: true, memberType: member.decl.type,
    fallback: fallbackOf(member.decl, values), offset,
  });
}

export default defineRule({
  id: 'enum-binding-no-fallback',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} (${f.memberType}) binds the row field ${f.value} with no fallback — an initial cell ships "", which is no ${f.memberType}: validateProperty throws and the whole view fails to render. Bind it with a fallback - {= \${${f.dynamic ? '…' : f.value}} || '${f.fallback}' } - or a formatter`,
  check,
});
