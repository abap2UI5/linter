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
    const impl = src.slice(src.search(/\bCLASS\s+\w+\s+IMPLEMENTATION\b/i));
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
  summary: 'a PUBLIC attribute the class uses but never binds',
  detail: 'The other half of the surface `unused-public-attribute` judges, kept as a separate rule because the remedy differs: an unused name is deleted, an unbound one moves to `PROTECTED`. Only the MODEL filters on visibility — `z2ui5_cl_ui5_srv_model` serializes the PUBLIC instance attributes into the view model on every roundtrip — while the draft persists the whole object whatever the section, so state survives at PROTECTED just the same. A PUBLIC attribute that no binding reaches is therefore transport weight and nothing else. Judged on the class\'s own binding vocabulary: the attribute as an argument of a `_bind*( )` call, as a boolean `b = name`, or as a model path (`{/NAME}`, `/NAME/`, `omit_initial_paths`). App classes only, instance `DATA` only; a `TYPE REF TO` attribute stays out (a reference can never be bound, see `binding-to-reference`), and a name that appears exactly once belongs to the sibling rule. A warning, not an error: a called app may read the attribute from OUTSIDE (a value help handing its result back is written exactly so), which no single source can see - but a run can: an attribute another class of the run reads as `->name`, in a class that names this one (`CAST`, `TYPE REF TO`, `NEW`), is not reported. Its first corpus run found three: two that the corpus\'s own gate had excused because its path regex matched the name inside a COMMENT, and one in a class that gate never judged.',
  example: `PUBLIC SECTION.
  DATA mv_note TYPE string.   " read and written in ABAP, bound nowhere
" … )->a( n = \`text\` t = mv_note )`,
  remedy: `PROTECTED SECTION.
  DATA mv_note TYPE string.   " state survives the roundtrip here too; only a binding needs PUBLIC
" … )->a( n = \`text\` t = mv_note )`,
  message: (f) => `PUBLIC attribute ${f.member} is used in ABAP but no binding reaches it — only the MODEL needs PUBLIC, state survives the roundtrip at PROTECTED too; move it there, or bind it`,
  check,
});
