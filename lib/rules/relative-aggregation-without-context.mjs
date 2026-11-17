import { defineRule } from '../rule.mjs';
import { relativePath } from '../binding-paths.mjs';

function check({ attr, bindings, boundElement, ctx, full, member, node, offset, ownerControl, value, report }) {
  /* The same trap on an AGGREGATION, which the line below excludes
   * on purpose (a row template's relative aggregation is the normal
   * form). Written as complex syntax, `{path: 'T_ITEMS'}`, the
   * missing leading slash is what makes it relative — and it falls
   * between two rules: `hardcoded-binding-path` only matches paths
   * that START with `/`, and the orphan check below skips
   * aggregations. With no context and no enclosing template there is
   * nothing to resolve against, so the aggregation renders EMPTY. */
  /* `boundElement`: the class issues cs_event-bind_element, which
   * sets a binding CONTEXT on a whole view slot at runtime. Every
   * relative binding under it then resolves against that row - which
   * is the entire point of the idiom, and invisible to a static walk
   * over the document. samples app 470 is the sample that TEACHES
   * it: a popup element-bound to the pressed product row, whose
   * component list binds `{T_ITEM}` relatively and correctly. Which
   * slot was bound is a second question, and a wrong second guess is
   * worse than silence - the same reasoning the size-limit rule was
   * held to before it was dropped. */
  if (!bindings || node.guessedAttrs?.has(attr)) return;
  if (member.set === 'aggregations' && !ctx && !boundElement
      && !ownerControl?.inTemplate && !ownerControl?.inBoundAgg) {
    /* the binding's OWN path only: `[^{}]*` refuses to cross into a
     * nested object, so a `sorter: { path: 'NAME' }` inside the same
     * binding info is not mistaken for it. */
    const complex = String(value).trim()
      .match(/^\{[^{}]*\bpath\s*:\s*'([^']+)'/);
    const bare = relativePath(value);
    /* a named model rides in front of the path (`message>/`); strip
     * it before asking whether the path is absolute, or every named
     * model reads as relative */
    const rel = (complex ? complex[1] : bare)?.replace(/^[\w.]+>/, '');
    // only a RELATIVE one - an absolute path resolves against the root
    if (rel && !rel.startsWith('/')) {
      report({
        control: full, member: attr, value: rel, offset,
      });
    }
  }
}

export default defineRule({
  id: 'relative-aggregation-without-context',
  severity: 'error',
  category: 'bindings',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} binds the RELATIVE path '${f.value}' with no binding context and no enclosing row template — the model resolves it against nothing, so the aggregation renders empty. A root-level aggregation needs the absolute form (client->_bind_path( … ))`,
  check,
});
