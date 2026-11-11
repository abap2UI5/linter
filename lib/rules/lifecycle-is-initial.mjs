import { defineRule } from '../rule.mjs';

/* A boolean asked whether it is EMPTY.
 *
 * The three `check_on_*( )` methods return `abap_bool`, so the branch is the
 * PREDICATIVE CALL — `IF client->check_on_init( ).` — which is how the
 * interface documents it and how the whole sample corpus is written. Compounds
 * keep the shape. `IS NOT INITIAL` asks a boolean whether it is empty, which is
 * what that question means for a STRING, and it is one more dialect every later
 * reader of the class has to hold. Only a NEGATIVE branch is spelled out, as
 * `= abap_false`; there is no negated predicative form in the corpus. The same
 * rule covers every other `abap_bool`, in a WHERE clause as much as in an IF.
 *
 * A hint, and deliberately: `abap_false` IS the initial value of a `char(1)`,
 * so the two spellings agree and the code does exactly what it says. Nothing
 * here is broken; it is the one dialect question in the app guide that a
 * finding can settle mechanically. */
function check({ src, source, report, boolVars }) {
  const shape = (not) => (not ? 'IS NOT INITIAL' : 'IS INITIAL');

  /* The tail a fix rewrites: ` IS [NOT ]INITIAL` at the end of the match. Only
   * offered when the ORIGINAL source spells the same characters there - the
   * scan runs over the scrubbed copy, where a comment inside the whitespace
   * would have been blanked to spaces, and deleting one is a guess. */
  /* Whitespace runs in this family are BOUNDED ({1,600} instead of +): the
   * unbounded form is ambiguous next to its neighbours and quadratic on a
   * crafted run of blanks (CodeQL js/polynomial-redos), and a scrubbed source
   * is full of long blank runs where comments used to be. 600 covers a couple
   * of full-line blanked comments inside one statement; a gap beyond that is
   * a match deliberately given up, not a defect. */
  const tailFix = (m, text) => {
    const tail = /\s{1,600}IS\s{1,600}(?:NOT\s{1,600})?INITIAL$/i.exec(m[0]);
    if (!tail) return {};
    const start = m.index + tail.index;
    const end = m.index + m[0].length;
    if (source && source.slice(start, end) !== src.slice(start, end)) return {};
    return { fixes: [{ start, end, text }] };
  };

  /* The handle is captured as a WHOLE identifier and its `client` suffix is
   * tested afterwards: `\w*client` in the pattern is the other quadratic
   * shape (the literal's letters are \w, so every failing start position
   * re-splits the run - CodeQL's '0' pump), while `\w+` against the disjoint
   * `\s`/`->` that follow backs off in one step. */
  for (const m of src.matchAll(/(?<!\w)(?:me->)?(\w+)\s{0,600}->(check_on_\w+)\s{0,600}\([^()\n]{0,600}\)\s{1,600}IS\s{1,600}(NOT\s{1,600})?INITIAL\b/gi)) {
    if (!/client$/i.test(m[1])) continue;
    /* Both directions are mechanical HERE, because the framework's lifecycle
     * checks return only abap_true/abap_false: `IS NOT INITIAL` becomes the
     * predicative call (the tail is deleted), `IS INITIAL` becomes the
     * spelled-out negative `= abap_false`. */
    report({
      member: `${m[2]}( )`,
      value: shape(m[3]), offset: m.index,
      ...tailFix(m, m[3] ? '' : ' = abap_false'),
    });
  }

  /* The lookbehind keeps a STRUCTURE COMPONENT out: in `row-flag IS INITIAL`
   * the component may be any type, and the class's own `flag` attribute is not
   * evidence about it. A `me->` handle is matched explicitly, so the lookbehind
   * sits in front of it rather than in front of the name. */
  for (const m of src.matchAll(/(?<![\w>-])(?:me->)?(\w+)\s{1,600}IS\s{1,600}(NOT\s{1,600})?INITIAL\b/gi)) {
    if (!boolVars.has(m[1].toUpperCase())) continue;
    /* Only `IS INITIAL` carries a fix on a plain variable: it is exactly
     * `= abap_false` (the initial value of a char(1) IS abap_false). The NOT
     * form is not mechanical - a declared abap_bool can technically hold any
     * character, so `IS NOT INITIAL` is `<> abap_false` while the dialect the
     * rule teaches writes `= abap_true`; choosing between the two is a guess
     * this fix must not make. */
    report({
      member: m[1],
      value: shape(m[2]), offset: m.index,
      ...(m[2] ? {} : tailFix(m, ' = abap_false')),
    });
  }
}

export default defineRule({
  id: 'lifecycle-is-initial',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'app',
  summary: '`IS INITIAL` / `IS NOT INITIAL` on an `abap_bool`',
  detail: 'The three `check_on_*( )` methods return `abap_bool`, so the branch is the PREDICATIVE CALL — `IF client->check_on_init( ).` — which is how `z2ui5_if_client` documents it and how the whole sample corpus is written. Compounds keep the shape (`` ELSEIF client->check_on_event( `LOCK` ). ``, `IF client->check_on_navigated( ) AND mv_ready = abap_true.`). `IS NOT INITIAL` asks a boolean whether it is EMPTY, which is what that question means for a string, and it is one more dialect every later reader of the class has to hold. Only a NEGATIVE branch is spelled out, as `= abap_false`: there is no negated predicative form. The same rule covers every other `abap_bool`, in a `WHERE` clause as much as in an `IF`. A hint, deliberately — `abap_false` IS the initial value of a `char(1)`, so the two spellings agree and nothing here is broken; it is the one dialect question in the app guide a finding can settle mechanically. A structure component is never judged: in `row-flag IS INITIAL` the component may be any type, and the class\'s own `flag` attribute is not evidence about it.',
  example: `IF client->check_on_init( ) IS NOT INITIAL.
IF mv_ready IS INITIAL.`,
  remedy: `IF client->check_on_init( ).
IF mv_ready = abap_false.`,
  fixNote: 'On a lifecycle call, `IS NOT INITIAL` becomes the predicative call (the tail is deleted) and `IS INITIAL` becomes `= abap_false` — the framework\'s checks return only `abap_true`/`abap_false`, so both rewrites are exact. On a plain `abap_bool` variable only `IS INITIAL` is rewritten (to `= abap_false`, its exact meaning for a char(1)); the NOT form is reported without a fix, because a variable can technically hold any character and choosing between `= abap_true` and `<> abap_false` would be a guess.',
  message: (f) => `${f.member} ${f.value} asks a boolean whether it is EMPTY — abap_bool takes the predicative call (IF client->check_on_init( ).) and, for a negative branch, = abap_false; there is no negated predicative form`,
  check,
});
