import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'delete-index-in-loop',
  summary: '`DELETE itab INDEX sy-tabix` inside a `LOOP AT` over the same table',
  detail: 'Reported only where `sy-tabix` is provably not the loop\'s own cursor any more — because that is what the measured incidents share. Where an inner construct between the loop header and the DELETE has overwritten it (a `READ TABLE`, an inner `LOOP` that ended, a `DO`), the DELETE hits another table\'s index — or index 0, which is the `TABLE_INVALID_INDEX` short dump a live app answered HTTP 500 with. The `READ TABLE` case holds on every runtime; the ended inner `LOOP` and the `DO` are transpiler behaviour — the ABAP kernel restores the enclosing loop\'s `sy-tabix` at `ENDLOOP` and `DO` writes only `sy-index` — and they are reported because the same source runs on the transpiler runtime too, where both incidents were measured. The same holds when the DELETE names an ENCLOSING loop\'s table while an inner loop is open: `sy-tabix` then belongs to the inner one, and the deleted index is another table\'s row number. The plain current-row delete — the innermost loop\'s own, unclobbered cursor — is legal ABAP and stays silent: the kernel adjusts the loop cursor for a delete on the loop table, and so does the transpiler runtime. Build the result instead — collect what is kept and assign it back — or `DELETE itab WHERE …`; both read as what they do and survive a later statement wandering in between. The `DELETE itab INDEX sy-tabix` directly after a `READ TABLE`, outside a loop over that table, is correct and common, and is not reported.',
  example: `LOOP AT t_rows INTO DATA(row).
  READ TABLE t_map WITH KEY id = row-id INTO DATA(m).
  DELETE t_rows INDEX sy-tabix.   " sy-tabix is t_map's now - wrong row, or dump
ENDLOOP.`,
  remedy: `LOOP AT t_rows INTO DATA(row).
  DATA(idx) = sy-tabix.
  READ TABLE t_map WITH KEY id = row-id INTO DATA(m).
  DELETE t_rows INDEX idx.
ENDLOOP.`,
});
