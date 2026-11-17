import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'into-corresponding-inline-decl',
  summary: '`INTO CORRESPONDING FIELDS OF TABLE @DATA(…)` — 7.55 syntax',
  detail: 'Below 7.55 the system refuses the class with *"Inline data declarations cannot be used together with INTO CORRESPONDING additions"*, plus one follow-up *"Field … is unknown"* for every later read of the table that was never declared — three errors whose cause is the first one. abaplint stays green because its SELECT grammar puts no version gate on the inline declaration (measured at `syntax.version` v750 with `check_syntax` and `downport` on, control probe fired). Plain `INTO TABLE @DATA(…)` is fine from 7.40 on; it is only the combination with `CORRESPONDING` that is late. Declare the table with `DATA … TYPE STANDARD TABLE OF … WITH EMPTY KEY` and select into it.',
  example: `SELECT * FROM scarr INTO CORRESPONDING FIELDS OF TABLE @DATA(lt_carr).`,
  remedy: `DATA lt_carr TYPE STANDARD TABLE OF scarr WITH EMPTY KEY.
SELECT * FROM scarr INTO CORRESPONDING FIELDS OF TABLE @lt_carr.`,
});
