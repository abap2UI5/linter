/*
 * suggest — the one name a misspelling can only have meant.
 *
 * A closed set (the controls of a library, the members of a control, an
 * enum, the icon font, the ids a class declares) and a name that is not in
 * it: where exactly ONE member of the set is the written name up to letter
 * case and the `-`/`_` separators, the finding names it and carries a fix
 * that writes it. Nothing fuzzier — an edit distance would offer `Button`
 * for `Buttom` and `Text` for `Test` alike, and the second is a guess. Two
 * candidates folding to the same key is no candidate at all.
 */

const fold = (s) => String(s).toLowerCase().replace(/[-_]/g, '');

/** The unique member of `candidates` that differs from `written` only by
 *  case or separators, or null. */
export function caseMatch(written, candidates) {
  const key = fold(written);
  let hit = null;
  for (const c of candidates) {
    if (c === written || fold(c) !== key) continue;
    if (hit !== null && hit !== c) return null;
    hit = c;
  }
  return hit;
}
