import { defineRule } from '../rule.mjs';

export default defineRule({
  id: 'default-key-table',
  severity: 'warning',
  category: 'structure',
  scope: 'class',
  summary: '`TYPE TABLE OF` with no key clause — the implicit default key',
  detail: 'Both `TYPE TABLE OF x` and `TYPE STANDARD TABLE OF x` without `WITH … KEY` fall back to the implicit default key: every character-like component, in declaration order. That key is real — `SORT itab` without `BY`, `COLLECT`, `DELETE ADJACENT DUPLICATES` and a `READ TABLE … WITH KEY` on a keyless table all use it, unasked — and it is not what the author wrote. The ecosystem writes the key out, `WITH EMPTY KEY` for a table that has none or the key it means; abaplint\'s `default_key` rule sees only the EXPLICIT `WITH DEFAULT KEY`, so the implicit form slipped every gate (samples-controls app 034). Judged per declaration element, `DATA` and `TYPES` alike; SORTED and HASHED tables require a key and are out, a named table type carries its own. No fix, on purpose: EMPTY KEY and a real key are different tables. In `checkAbapHygiene( )`, so `--all-classes` reaches a helper class too.',
  example: 'DATA mt_rows TYPE TABLE OF string.',
  remedy: 'DATA mt_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.',
  message: (f) => `${f.member ? `${f.member} ` : ''}TYPE TABLE OF without a key clause — the implicit default key is every character-like component in declaration order, and SORT, COLLECT and DELETE ADJACENT DUPLICATES use it unasked; declare WITH EMPTY KEY or the key you mean`,
  check({ model, source, report }) {
    const { code: blankHygiene } = model;
    /* A standard table declared without a key clause. `TYPE TABLE OF` and
     * `TYPE STANDARD TABLE OF` both fall back to the IMPLICIT default key —
     * every character-like component, in declaration order — and that key is
     * what SORT without BY, COLLECT, DELETE ADJACENT DUPLICATES and a
     * `READ TABLE … WITH KEY` on a table without one silently use. The
     * ecosystem writes the key out (`WITH EMPTY KEY`, or a real one); abaplint's
     * default_key rule only sees the EXPLICIT `WITH DEFAULT KEY`, so the
     * implicit form slipped every gate (samples-controls app 034). Judged per
     * declaration element: the text from `OF` to the element's own `,` or `.`
     * has to carry a WITH … KEY. SORTED and HASHED tables require a key and are
     * out; a named table type carries its own. No fix — EMPTY KEY and a real
     * key are different tables, and choosing is the author's. */
    /* Linear in the class: the element's end is searched FROM the match and
     * the name read backwards from it. Slicing the rest of the source and
     * matching `(\w+)\s*$` against everything before each declaration made
     * a class of 10,000 such lines take a minute. */
    /* …and linear when no `.` or `,` follows either: the element's end is
     * found once for every declaration it holds (the matches come in order,
     * so a stop past this one is the stop of the next), and the key clauses
     * are located in one scan, each element asking only whether the next one
     * starts before its stop. Searching and slicing per declaration took 7
     * seconds for 20,000 declarations with nothing between them. */
    const elementStop = /[.,]/g;
    const keyClauses = [...blankHygiene.matchAll(/\bWITH\s+(?:(?:NON-)?UNIQUE\s+|EMPTY\s+|DEFAULT\s+)?KEY\b/gi)].map((k) => k.index);
    let stop = -1;
    let nextKey = 0;
    for (const m of blankHygiene.matchAll(/\bTYPE\s+(?:STANDARD\s+)?TABLE\s+OF\b/gi)) {
      const from = m.index + m[0].length;
      if (stop < from) {
        elementStop.lastIndex = from;
        stop = elementStop.exec(blankHygiene)?.index ?? blankHygiene.length;
      }
      while (nextKey < keyClauses.length && keyClauses[nextKey] < from) nextKey++;
      if (nextKey < keyClauses.length && keyClauses[nextKey] < stop) continue;
      let nameEnd = m.index;
      while (nameEnd > 0 && /\s/.test(blankHygiene[nameEnd - 1])) nameEnd--;
      let nameStart = nameEnd;
      while (nameStart > 0 && /\w/.test(blankHygiene[nameStart - 1])) nameStart--;
      const name = blankHygiene.slice(nameStart, nameEnd);
      // dedupe = offset: two such declarations in a chain are two findings
      report({ member: name, dedupe: String(m.index), offset: m.index });
    }
  },
});
