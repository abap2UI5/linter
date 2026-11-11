import { defineRule } from '../rule.mjs';

function check({ src, report }) {
  /* The same FOR iterator name twice in one method. Fine on 7.50+, where the
   * iterator is local to its VALUE #( ) expression — but a 7.02 downport
   * (abaplint --fix, and the transpiler behind the e2e runtime) materializes
   * each one as `DATA <name> TYPE i` in the method body, and the second
   * declaration fails activation with "variable already defined". */
  for (const mm of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    // ABAP names are case-insensitive: `FOR i` and `FOR I` are one variable
    // to the downport, so they are one iterator here (reported as written)
    const iterators = new Set();
    for (const m of mm[0].matchAll(/\bFOR\s+(\w+)\s*=/gi)) {
      const key = m[1].toLowerCase();
      if (iterators.has(key)) {
        report({ member: m[1], offset: mm.index + m.index });
      } else {
        iterators.add(key);
      }
    }
  }
}

export default defineRule({
  id: 'duplicate-for-iterator',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: 'the same `FOR` iterator name twice in one method',
  detail: 'Fine on ABAP 7.50+, where the iterator is local to its `VALUE #( )` expression — but a 7.02 downport (abaplint `--fix`, and the transpiler behind a Node-based runtime) materializes each one as `DATA <name> TYPE i` in the method body, and the second declaration fails activation with "variable already defined". Use distinct names (`i`, `j`, `k`) per `VALUE` block.',
  example: `DATA(a) = VALUE ty_t( FOR i = 1 WHILE i <= 3 ( i ) ).
DATA(b) = VALUE ty_t( FOR i = 1 WHILE i <= 3 ( i ) ).   " downported: i declared twice`,
  remedy: `DATA(a) = VALUE ty_t( FOR i = 1 WHILE i <= 3 ( i ) ).
DATA(b) = VALUE ty_t( FOR j = 1 WHILE j <= 3 ( j ) ).`,
  message: (f) => `FOR iterator '${f.member}' is used twice in one method — a 7.02 downport materializes each as DATA ${f.member} TYPE i and fails with "variable already defined"; use distinct names (i, j, k)`,
  check,
});
