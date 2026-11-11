import { defineRule } from '../rule.mjs';

function check({ publicAttrs, readFromOutside, wordUses, report }) {
  for (const attribute of publicAttrs) {
    if (wordUses(attribute.name) === 1 && !readFromOutside(attribute.name)) {
      report({ member: attribute.name, offset: attribute.offset });
    }
  }
}

export default defineRule({
  id: 'unused-public-attribute',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'app',
  summary: 'a PUBLIC attribute nothing in the class ever touches',
  detail: 'Only PUBLIC attributes are serialized into the model (`z2ui5_cl_ui5_srv_model` filters on visibility), so every one of them is shipped to the browser on every roundtrip. One that is never bound, never read and never written is pure transport weight. Deliberately narrower than "not bound in any view": an attribute used only in ABAP code is not dead, it is *state* — PUBLIC is precisely how a value survives the roundtrip. Only a name that appears exactly once in the whole class, its own declaration, is reported, and only as a hint: an attribute can still be read from outside the class, which no single source file can see. Where the reader is in the run - another class that names this one and reads `->name` - it is seen, and the attribute is not reported.',
  example: `PUBLIC SECTION.
  DATA mv_note TYPE string.   " and mv_note appears nowhere else in the class`,
  remedy: `PROTECTED SECTION.
  DATA mv_note TYPE string.   " …or delete it: nothing binds, reads or writes it`,
  message: (f) => `PUBLIC attribute ${f.member} is never bound, read or written — it is serialized and shipped on every roundtrip for nothing`,
  check,
});
