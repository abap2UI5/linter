import { defineRule } from '../rule.mjs';
import { boundVocabulary, publicInstanceAttributes } from '../abap-helpers.mjs';

function check({ readFromOutside, src, wordUses, report }) {
  /* The other half of the same surface: a PUBLIC INSTANCE attribute the
   * class uses in ABAP but never BINDS. It is shipped to the browser on every
   * roundtrip like the one above, and unlike the one above it is not dead —
   * it is state, and state survives the roundtrip at PROTECTED just the same
   * (the draft serializes the whole object; only the MODEL filters on
   * visibility). So the remedy differs, and that is why this is a separate
   * rule rather than a widening of unused-public-attribute: an unused name is
   * deleted, an unbound one moves to PROTECTED. Judged on the class's own
   * binding vocabulary — an argument of a `_bind*( )` call, a boolean
   * `b = name`, or the name as a model path (`{/NAME}`, `/NAME/`,
   * `omit_initial_paths`). App classes only, since only the app's own
   * attributes are the model; `TYPE REF TO` attributes stay out (a reference
   * can never be bound — see binding-to-reference — and `client` is one).
   * A warning, not an error: a called app may read the attribute from
   * OUTSIDE (a value help handing its result back is written exactly so),
   * which no single source can see. */
  if (/\bINTERFACES\s+z2ui5_if_app\b/i.test(src)) {
    // a namespaced class name (`/kro/cl_app`) too: with `\w+` the search
    // missed, slice( -1 ) left nothing, and every attribute was unbound
    const impl = src.slice(Math.max(0, src.search(/\bCLASS\s+[\w/]+\s+IMPLEMENTATION\b/i)));
    const bound = boundVocabulary(src, impl);
    for (const attribute of publicInstanceAttributes(src)) {
      const n = attribute.name;
      if (attribute.reference) continue;
      if (wordUses(n) <= 1) continue; // unused-public-attribute's case
      if (readFromOutside(n)) continue;
      if (bound.has(n.toLowerCase())) continue;
      report({ member: n, offset: attribute.offset });
    }
  }
}

export default defineRule({
  id: 'unbound-public-attribute',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `PUBLIC attribute ${f.member} is used in ABAP but no binding reaches it — only the MODEL needs PUBLIC, state survives the roundtrip at PROTECTED too; move it there, or bind it`,
  check,
});
