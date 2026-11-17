import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'control-call-arg-kind',
  summary: 'a `t_arg` value that is not the kind the control method declares',
  detail: 'The declared kinds are not decoration — `castArg` acts on them. An `int` argument runs through `Number( )`, so a non-numeric literal arrives as `NaN` and every comparison against it is false: `sap.m.Button`\'s badge setters compare the incoming value against the stored bound, so the value is dropped into an `else` whose only effect is a `Log.warning`. A `bool` argument is `raw === "true" || raw === "X"` and nothing else, so a literal meant as true in any other spelling — `1`, `TRUE`, `abap_true`, `Y` — silently arrives as FALSE and switches the flag the wrong way. The ABAP boolean tokens (`X`, a space, the empty string) and the literal `true`/`false` are the accepted spellings and are never reported.',
  example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`panel\` ) ( \`setExpanded\` ) ( \`abap_true\` ) ) )`,
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`panel\` ) ( \`setExpanded\` ) ( \`X\` ) ) )`,
  fixNote: 'A `bool` argument spelled as a boolean whose meaning is not in doubt is rewritten inside its literal: `abap_true` and a lower-case `x` to `X`, any letter case of `true` to `true`, and `abap_false` / `FALSE` — which already arrive as false — to `false`. `1`, `Y`, a word and every `int` argument keep the finding without a fix.',
});
