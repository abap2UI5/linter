import { defineRule } from '../rule.mjs';

export default defineRule({
  id: 'boolc-instead-of-xsdbool',
  severity: 'warning',
  category: 'structure',
  scope: 'class',
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
