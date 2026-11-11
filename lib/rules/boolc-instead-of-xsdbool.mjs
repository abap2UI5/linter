import { defineRule } from '../rule.mjs';

export default defineRule({
  id: 'boolc-instead-of-xsdbool',
  severity: 'warning',
  category: 'structure',
  scope: 'class',
  summary: '`boolc( )` where the ecosystem mandates `xsdbool( )`',
  detail: 'The abap2UI5 ecosystem\'s downport pipeline converts `xsdbool( )` to `boolc( )` automatically for the releases that need it — so `xsdbool` is the form to write, and a hand-written `boolc` breaks the conversion in the other direction. They are also not aliases: `boolc` returns a `char1`-in-string whose FALSE is a **blank** (` `), `xsdbool` an `abap_bool` whose false is initial — the classic trap where `IF boolc( … ) IS INITIAL.` is never true. No fix renames one into the other, because that difference is behaviour, not spelling.',
  example: `DATA(ok) = boolc( x > 1 ).   " c LENGTH 1, not abap_bool`,
  remedy: `DATA(ok) = xsdbool( x > 1 ).`,
  message: () => 'boolc( ) where the ecosystem writes xsdbool( ) — the downport converts xsdbool to boolc automatically, so a hand-written boolc breaks the conversion in the other direction (and its FALSE is a blank, not an initial char)',
  check({ model, report }) {
    const { tokens } = model;
    for (let k = 0; k + 1 < tokens.length; k++) {
      const t = tokens[k];
      if (t.kind !== 'word' || t.upper !== 'BOOLC' || tokens[k + 1].text !== '(') continue;
      // dedupe = offset, so every call site is its own finding
      report({ dedupe: String(t.start), offset: t.start });
    }
  },
});
