import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'default-key-table',
  summary: '`TYPE TABLE OF` with no key clause — the implicit default key',
  detail: 'Both `TYPE TABLE OF x` and `TYPE STANDARD TABLE OF x` without `WITH … KEY` fall back to the implicit default key: every character-like component, in declaration order. That key is real — `SORT itab` without `BY`, `COLLECT`, `DELETE ADJACENT DUPLICATES` and a `READ TABLE … WITH KEY` on a keyless table all use it, unasked — and it is not what the author wrote. The ecosystem writes the key out, `WITH EMPTY KEY` for a table that has none or the key it means; abaplint\'s `default_key` rule sees only the EXPLICIT `WITH DEFAULT KEY`, so the implicit form slipped every gate (samples-controls app 034). Judged per declaration element, `DATA` and `TYPES` alike; SORTED and HASHED tables require a key and are out, a named table type carries its own. No fix, on purpose: EMPTY KEY and a real key are different tables. In `checkAbapHygiene( )`, so `--all-classes` reaches a helper class too.',
  example: 'DATA mt_rows TYPE TABLE OF string.',
  remedy: 'DATA mt_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.',
});
