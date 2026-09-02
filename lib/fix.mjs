/*
 * fix — apply the fixes a finding brought with it.
 *
 * A rule attaches `fixes: [{ start, end, text }]` — exact character spans in
 * the source it was given — when, and only when, the correction is
 * mechanical: the same call with the current method name, a missing `$`, a
 * bare boolean token wrapped, a call that provably does nothing deleted. A
 * rule whose correction needs a decision (which
 * of two duplicate attributes survives, what event a `_bind` on an event slot
 * should raise) deliberately carries none: a fix that has to guess is worse
 * than a finding that stays.
 *
 * Suppression happens before this: `--fix` works off the findings that
 * survived the `rules` block and the source directives, so a waived line is
 * never rewritten.
 */

/** Rule ids that can carry a fix — for the docs and the rules page. */
export const FIXABLE = Object.freeze(['obsolete-binder', 'obsolete-bind-argument', 'obsolete-model-update', 'obsolete-frontend-event', 'unconverted-abap-boolean', 'event-arg-unresolved', 'popover-display-val', 'undeclared-namespace', 'literal-view-slot', 'chain-house-layout', 'escaped-brace-in-backtick', 'lifecycle-is-initial', 'redundant-conv-i', 'trailing-empty-event-arg', 'byte-order-mark', 'crlf-line-ending', 'trailing-whitespace', 'missing-final-newline', 'redundant-init-display', 'binding-to-reference', 'unescaped-brace-in-style', 'collapsed-brace-in-style', 'class-constructor-visibility', 'escape-sequence-in-backtick', 'json-bind-on-scalar-property', 'unknown-control', 'unknown-property', 'unknown-aggregation', 'invalid-property-value', 'unknown-event-parameter', 'unknown-icon', 'frontend-action-unknown-id', 'popover-anchor-unknown-id', 'event-name-case-mismatch']);

export const isFixable = (finding) => Boolean(finding?.fixes?.length);

/** A span that is not a span in THIS source: a non-integer bound, a negative
 *  start, an end past the last character, or the two the wrong way round. */
const malformed = (e, length) => !(Number.isInteger(e.start) && Number.isInteger(e.end)
  && e.start >= 0 && e.end <= length && e.start <= e.end);

/**
 * Rewrite `source` with every fix the findings carry. Overlapping spans are
 * left for the next run rather than resolved by guesswork — `--fix` is
 * expected to be run until it reports nothing, exactly like its neighbours.
 *
 * Returns { output, applied, deferred, dropped }.
 *
 * `dropped` is the third outcome and it is a DEFECT, not a decision. A span
 * that does not address this source is a rule computing offsets against the
 * wrong text (the scrubbed copy, a different document of the same class), and
 * dropping it silently produced the worst report this tool can write: "fixed 0
 * problems", the finding surviving every `--fix` pass, and nothing anywhere
 * saying why. It is counted, the CLI prints it, and under
 * ABAP2UI5LINT_STRICT_FIXES it throws — which is what the suite runs with, so
 * a rule cannot ship a span the fixer cannot use.
 */
export function applyFixes(source, findings) {
  const all = findings.flatMap((f) => f.fixes ?? []);
  const usable = all.filter((e) => !malformed(e, source.length));
  const dropped = all.length - usable.length;
  if (dropped && process.env.ABAP2UI5LINT_STRICT_FIXES === 'true') {
    const bad = all.find((e) => malformed(e, source.length));
    throw new Error(`applyFixes: ${dropped} fix span(s) do not address this source `
      + `(first: start=${JSON.stringify(bad.start)} end=${JSON.stringify(bad.end)}, source length ${source.length}) `
      + '- the rule computed them against different text');
  }
  const edits = usable.sort((a, b) => a.start - b.start || a.end - b.end);

  let out = '';
  let cursor = 0;
  let applied = 0;
  let deferred = 0;
  for (const e of edits) {
    if (e.start < cursor) { deferred++; continue; }
    out += source.slice(cursor, e.start) + e.text;
    cursor = e.end;
    applied++;
  }
  return { output: out + source.slice(cursor), applied, deferred, dropped };
}
