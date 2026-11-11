import { defineRule } from '../rule.mjs';
import { findWords } from '../abap-model.mjs';

/* `INTO CORRESPONDING FIELDS OF TABLE @DATA(…)` is 7.55 syntax. abaplint
 * stays green because its SELECT grammar puts no version gate on the inline
 * declaration. Plain `INTO TABLE @DATA(…)` is fine from 7.40 on; only the
 * combination is late. */
const PHRASE = ['INTO', 'CORRESPONDING', 'FIELDS', 'OF', 'TABLE'];

export default defineRule({
  id: 'into-corresponding-inline-decl',
  severity: 'error',
  category: 'lifecycle',
  scope: 'class',
  summary: '`INTO CORRESPONDING FIELDS OF TABLE @DATA(…)` — 7.55 syntax',
  detail: 'Below 7.55 the system refuses the class with *"Inline data declarations cannot be used together with INTO CORRESPONDING additions"*, plus one follow-up *"Field … is unknown"* for every later read of the table that was never declared — three errors whose cause is the first one. abaplint stays green because its SELECT grammar puts no version gate on the inline declaration (measured at `syntax.version` v750 with `check_syntax` and `downport` on, control probe fired). Plain `INTO TABLE @DATA(…)` is fine from 7.40 on; it is only the combination with `CORRESPONDING` that is late. Declare the table with `DATA … TYPE STANDARD TABLE OF … WITH EMPTY KEY` and select into it.',
  example: `SELECT * FROM scarr INTO CORRESPONDING FIELDS OF TABLE @DATA(lt_carr).`,
  remedy: `DATA lt_carr TYPE STANDARD TABLE OF scarr WITH EMPTY KEY.
SELECT * FROM scarr INTO CORRESPONDING FIELDS OF TABLE @lt_carr.`,
  message: (f) => `INTO CORRESPONDING FIELDS OF TABLE @DATA(${f.member}) is 7.55 syntax — below that release the class is refused ("inline data declarations cannot be used together with INTO CORRESPONDING"), plus one "field is unknown" for every later read; declare the table and select INTO CORRESPONDING FIELDS OF TABLE @${f.member}`,
  check({ model, report }) {
    const { tokens } = model;
    for (const k of findWords(tokens, PHRASE)) {
      const [at, data, open, name, close] = tokens.slice(k + PHRASE.length, k + PHRASE.length + 5);
      // `@DATA(` is written without blanks; the name may have them around it
      if (at?.text !== '@' || data?.upper !== 'DATA' || data.start !== at.end) continue;
      if (open?.text !== '(' || open.start !== data.end || name?.kind !== 'word' || close?.text !== ')') continue;
      report({ member: name.text, offset: tokens[k].start });
    }
  },
});
