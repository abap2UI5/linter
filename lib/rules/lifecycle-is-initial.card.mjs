import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'lifecycle-is-initial',
  summary: '`IS INITIAL` / `IS NOT INITIAL` on an `abap_bool`',
  detail: 'The three `check_on_*( )` methods return `abap_bool`, so the branch is the PREDICATIVE CALL — `IF client->check_on_init( ).` — which is how `z2ui5_if_client` documents it and how the whole sample corpus is written. Compounds keep the shape (`` ELSEIF client->check_on_event( `LOCK` ). ``, `IF client->check_on_navigated( ) AND mv_ready = abap_true.`). `IS NOT INITIAL` asks a boolean whether it is EMPTY, which is what that question means for a string, and it is one more dialect every later reader of the class has to hold. Only a NEGATIVE branch is spelled out, as `= abap_false`: there is no negated predicative form. The same rule covers every other `abap_bool`, in a `WHERE` clause as much as in an `IF`. A hint, deliberately — `abap_false` IS the initial value of a `char(1)`, so the two spellings agree and nothing here is broken; it is the one dialect question in the app guide a finding can settle mechanically. A structure component is never judged: in `row-flag IS INITIAL` the component may be any type, and the class\'s own `flag` attribute is not evidence about it.',
  example: `IF client->check_on_init( ) IS NOT INITIAL.
IF mv_ready IS INITIAL.`,
  remedy: `IF client->check_on_init( ).
IF mv_ready = abap_false.`,
  fixNote: 'On a lifecycle call, `IS NOT INITIAL` becomes the predicative call (the tail is deleted) and `IS INITIAL` becomes `= abap_false` — the framework\'s checks return only `abap_true`/`abap_false`, so both rewrites are exact. On a plain `abap_bool` variable only `IS INITIAL` is rewritten (to `= abap_false`, its exact meaning for a char(1)); the NOT form is reported without a fix, because a variable can technically hold any character and choosing between `= abap_true` and `<> abap_false` would be a guess.',
});
