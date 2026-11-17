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
  message: (f) => `PUBLIC attribute ${f.member} is never bound, read or written — it is serialized and shipped on every roundtrip for nothing`,
  check,
});
