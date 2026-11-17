import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'boolc-instead-of-xsdbool',
  summary: '`boolc( )` where the ecosystem mandates `xsdbool( )`',
  detail: 'The abap2UI5 ecosystem\'s downport pipeline converts `xsdbool( )` to `boolc( )` automatically for the releases that need it — so `xsdbool` is the form to write, and a hand-written `boolc` breaks the conversion in the other direction. They are also not aliases: `boolc` returns a `char1`-in-string whose FALSE is a **blank** (` `), `xsdbool` an `abap_bool` whose false is initial — the classic trap where `IF boolc( … ) IS INITIAL.` is never true. No fix renames one into the other, because that difference is behaviour, not spelling.',
  example: `DATA(ok) = boolc( x > 1 ).   " c LENGTH 1, not abap_bool`,
  remedy: `DATA(ok) = xsdbool( x > 1 ).`,
});
