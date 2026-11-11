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
  summary: 'a root-level aggregation bound with a relative path — it resolves against nothing and renders empty',
  detail: 'Inside a bound row template a relative aggregation path is the normal and correct form. Outside one there is no context: `Model.resolve` returns `undefined` for a relative path with none (legacy syntax is off since 1.88), `bindList` never resolves, and the aggregation stays **empty** with no error anywhere. The complex form hides it well — `{path: \'T_ITEMS\'}` looks deliberate, and the missing leading slash is the whole defect. It falls between two existing rules: `hardcoded-binding-path` only matches paths that START with `/`, and `relative-binding-without-context` deliberately skips aggregations. Reported only where the control has neither a binding context nor an enclosing template, which is what separates the broken cases from the dominant correct ones. Three narrowings came from running it on a 637-file corpus, where it first fired 81 times: the binding\'s OWN path only (a nested `sorter: { path: … }` is not it), a named model stripped before asking whether the path is absolute (`message>/` IS absolute), and an aggregation whose value the reconstructor could not resolve — a `_bind( )` handed in as a method parameter — still makes its children a row template, because a blind spot is not a defect. A fourth came from the `abap2UI5/samples` corpus after release: a class that issues `cs_event-bind_element` sets a binding **context on a whole view slot at runtime**, so every relative path under it resolves against a row the document never names — which is the entire point of that idiom, and invisible to a static walk. Which slot was bound is a second question, and a wrong second guess is worse than silence.',
  example: ')->a( n = `items` v = `{path: \'T_LEGEND\'}` )   " no context: renders empty',
  remedy: ')->a( n = `items` v = client->_bind_path( t_legend ) )   " the absolute path, derived',
  message: (f) => `${f.control} ${f.member} binds the RELATIVE path '${f.value}' with no binding context and no enclosing row template — the model resolves it against nothing, so the aggregation renders empty. A root-level aggregation needs the absolute form (client->_bind_path( … ))`,
  check,
});
