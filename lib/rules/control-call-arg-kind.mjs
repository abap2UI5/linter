import { defineRule } from '../rule.mjs';
import { CONTROL_METHOD_KINDS } from '../frontend-actions.mjs';

/* The spellings of a `bool` control-method argument the frontend does not
 * accept but whose meaning is not in doubt, keyed lower-case, and what to
 * write instead: castArg reads `X` and `true` as true and everything else as
 * false. */
const BOOL_SPELLINGS = Object.freeze({ abap_true: 'X', true: 'true', x: 'X', abap_false: 'false', false: 'false' });

function check({ action, args, src, report }) {
  /* The kinds a declared control method's arguments are cast to (see
   * control-call-arg-count): `int` runs through `Number( )`, `bool` is
   * `raw === "true" || raw === "X"` - a literal that is neither silently
   * means FALSE. */
  if (action !== 'control_by_id' || !args[1]?.value) return;
  const kinds = CONTROL_METHOD_KINDS[args[1].value];
  const sent = args.slice(2);
  for (let i = 0; kinds && i < Math.min(kinds.length, sent.length); i++) {
    const v = sent[i]?.value;
    if (v === null || v === undefined) continue; // not a literal
    /* …and neither is a value the CLIENT resolves before dispatch: a
     * `${…}` expression or a `$event` reference arrives as whatever the
     * browser computed, so judging its ABAP text as an int or a bool is
     * judging the wrong string. The id rules take the same exclusion. */
    if (String(v).startsWith('$') || String(v).includes('{')) continue;
    const bad = (kinds[i] === 'int' && !/^-?\d+$/.test(String(v).trim()))
      || (kinds[i] === 'bool' && !['X', 'true', '', ' ', 'false'].includes(String(v)));
    if (bad) {
      /* A bool spelled as one of the booleans it was evidently meant as
       * is rewritten inside its literal: ABAP's `abap_true` and a
       * lower-case `x` to `X`, `TRUE` to `true`, and the false spellings
       * (`abap_false`, `FALSE`), which already arrive as false, to
       * `false`. `1`, `Y` or a word stay reported without one. */
      const spelled = kinds[i] === 'bool' ? BOOL_SPELLINGS[String(v).trim().toLowerCase()] : undefined;
      const lit = sent[i];
      const fix = spelled && lit.litStart !== null && /^[`'|]$/.test(src[lit.litStart])
        ? [{ start: lit.litStart + 1, end: lit.litEnd - 1, text: spelled }] : null;
      report({
        control: 'CONTROL_BY_ID', member: args[1].value,
        value: String(v).slice(0, 40), memberType: kinds[i], offset: sent[i].offset,
        ...(fix ? { suggestion: spelled, fixes: fix } : {}),
      });
    }
  }
}

export default defineRule({
  id: 'control-call-arg-kind',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a `t_arg` value that is not the kind the control method declares',
  detail: 'The declared kinds are not decoration — `castArg` acts on them. An `int` argument runs through `Number( )`, so a non-numeric literal arrives as `NaN` and every comparison against it is false: `sap.m.Button`\'s badge setters compare the incoming value against the stored bound, so the value is dropped into an `else` whose only effect is a `Log.warning`. A `bool` argument is `raw === "true" || raw === "X"` and nothing else, so a literal meant as true in any other spelling — `1`, `TRUE`, `abap_true`, `Y` — silently arrives as FALSE and switches the flag the wrong way. The ABAP boolean tokens (`X`, a space, the empty string) and the literal `true`/`false` are the accepted spellings and are never reported.',
  example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`panel\` ) ( \`setExpanded\` ) ( \`abap_true\` ) ) )`,
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`panel\` ) ( \`setExpanded\` ) ( \`X\` ) ) )`,
  fixNote: 'A `bool` argument spelled as a boolean whose meaning is not in doubt is rewritten inside its literal: `abap_true` and a lower-case `x` to `X`, any letter case of `true` to `true`, and `abap_false` / `FALSE` — which already arrive as false — to `false`. `1`, `Y`, a word and every `int` argument keep the finding without a fix.',
  message: (f) => {
    return f.memberType === 'int'
      ? `${f.member} declares its argument as int and '${f.value}' is not numeric — castArg runs it through Number( ), so it arrives as NaN and every comparison against it is false`
      : `${f.member} declares its argument as bool, and only 'X' and 'true' are true — '${f.value}' silently arrives as FALSE`;
  },
  check,
});
