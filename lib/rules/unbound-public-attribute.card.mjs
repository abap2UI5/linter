import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unbound-public-attribute',
  summary: 'a PUBLIC attribute the class uses but never binds',
  detail: 'The other half of the surface `unused-public-attribute` judges, kept as a separate rule because the remedy differs: an unused name is deleted, an unbound one moves to `PROTECTED`. Only the MODEL filters on visibility — `z2ui5_cl_ui5_srv_model` serializes the PUBLIC instance attributes into the view model on every roundtrip — while the draft persists the whole object whatever the section, so state survives at PROTECTED just the same. A PUBLIC attribute that no binding reaches is therefore transport weight and nothing else. Judged on the class\'s own binding vocabulary: the attribute as an argument of a `_bind*( )` call, as a boolean `b = name`, or as a model path (`{/NAME}`, `/NAME/`, `omit_initial_paths`). App classes only, instance `DATA` only; a `TYPE REF TO` attribute stays out (a reference can never be bound, see `binding-to-reference`), and a name that appears exactly once belongs to the sibling rule. A warning, not an error: a called app may read the attribute from OUTSIDE (a value help handing its result back is written exactly so), which no single source can see - but a run can: an attribute another class of the run reads as `->name`, in a class that names this one (`CAST`, `TYPE REF TO`, `NEW`), is not reported. Its first corpus run found three: two that the corpus\'s own gate had excused because its path regex matched the name inside a COMMENT, and one in a class that gate never judged.',
  example: `PUBLIC SECTION.
  DATA mv_note TYPE string.   " read and written in ABAP, bound nowhere
" … )->a( n = \`text\` t = mv_note )`,
  remedy: `PROTECTED SECTION.
  DATA mv_note TYPE string.   " state survives the roundtrip here too; only a binding needs PUBLIC
" … )->a( n = \`text\` t = mv_note )`,
});
