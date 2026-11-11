import { defineRule } from '../rule.mjs';

/*
 * ABAP flags written straight into an attribute value. The builder's
 * `a( b = … )` renders true/false itself; passing the flag through `v` puts an
 * 'X' or a blank in the view, and UI5 reads the blank as a non-empty string -
 * the silent inversion this rule exists for.
 */
/* An ABAP date or time field converted with the JS-string date formatter.
 *
 * The curated module ships three date helpers, and which one a field needs is
 * decided by what the ABAP type SERIALIZES as. `DateCreateObject` is
 * `new Date( s )`: it wants a string the JS Date constructor parses, which is
 * an ISO one. An ABAP `TYPE d` reaches the model as `20240101` and a `TYPE t`
 * as `120000`, and the constructor parses NEITHER — both come back as an
 * Invalid Date. `DateAbapDateToDateObject` / `DateAbapDateTimeToDateObject`
 * exist for exactly that and split the digits themselves.
 *
 * What makes it worth a rule is the failure mode, which the framework module
 * documents in its own comment: an Invalid Date is TRUTHY, so every guard that
 * merely checks for presence accepts it, and the throw happens much later and
 * somewhere else — `sap.ui.unified` Month._checkDateEnabled →
 * `CalendarDate.fromLocalJSDate` throws for every rendered day and takes the
 * whole view down. Nothing between the binding and that stack says the word
 * "date".
 *
 * Deliberately NOT the empty-value case the corpus gate used to catch: the
 * framework closed that one at the source (`DateCreateObject` returns null for
 * a falsy input, and `isNoAbapDate` rejects anything that is not eight
 * digits), so a rule for it would now report correct code. The type mismatch
 * is the half no guard upstream can see, because the formatter is handed a
 * string and cannot know which ABAP type produced it. */
function check({ src, code, report }) {
  /* The declaration forms that carry a date or a time: a DATA/constant
   * declaration and a component of a TYPES structure read the same. The
   * negative lookahead keeps `TYPE d` from matching the start of a longer
   * type name (`TYPE decfloat34`, `TYPE dats_long`).
   *
   * Read out of the blanked copy: this half looks for a DECLARATION, and a
   * class quoting one in its own prose declares nothing. The half below is
   * the opposite and reads `src` - a binding info only ever exists INSIDE a
   * literal, which is what makes it a binding info. */
  const dateFields = new Map();
  for (const m of code.matchAll(/\b(\w+)\s+TYPE\s+(dats|tims|d|t)\b(?![\w-])/gi)) {
    dateFields.set(m[1].toUpperCase(), m[2].toLowerCase());
  }
  if (!dateFields.size) return;

  /* One binding info at a time, so a `path` is only ever paired with the
   * formatter written beside it — and either order parses, since a hand-typed
   * binding info is as likely to open with the formatter as with the path.
   * A `{` up to the next brace, when that is a `}` and the formatter is
   * between them - what `/\{[^{}]*formatter:…'[^{}]*\}/g` matched, pairing
   * the braces in one pass: that regex split every unclosed `{…` between
   * its two brace-free runs again at each formatter in it. */
  const braces = [...src.matchAll(/[{}]/g)];
  for (let k = 0; k + 1 < braces.length; k++) {
    if (braces[k][0] !== '{' || braces[k + 1][0] !== '}') continue;
    const m = { index: braces[k].index, 0: src.slice(braces[k].index, braces[k + 1].index + 1) };
    if (!/formatter:\s*'(?:z2ui5\.)?Formatter\.DateCreateObject'/.test(m[0])) continue;
    const pm = m[0].match(/path:\s*'([^']+)'/);
    if (!pm) continue;
    const field = pm[1].split('/').filter(Boolean).pop();
    if (!field) continue;
    const abapType = dateFields.get(field.toUpperCase());
    if (!abapType) continue;
    report({
      member: field,
      value: abapType,
      offset: m.index + m[0].indexOf(pm[0]),
    });
  }
}

export default defineRule({
  id: 'abap-date-formatter-mismatch',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  summary: 'an ABAP `TYPE d`/`TYPE t` field converted with `Formatter.DateCreateObject`',
  detail: 'The curated module ships three date helpers, and which one a field needs is decided by what its ABAP type SERIALIZES as. `DateCreateObject` is `new Date( s )` and wants a string the JS Date constructor parses — an ISO one. A `TYPE d` reaches the model as `20240101` and a `TYPE t` as `120000`, and the constructor parses neither: both come back as an **Invalid Date**. `DateAbapDateToDateObject` and `DateAbapDateTimeToDateObject` exist for exactly this and split the digits themselves. What makes it worth a rule is where it surfaces: an Invalid Date is TRUTHY, so every guard that merely checks for presence accepts it, and the throw happens much later and somewhere else — `sap.ui.unified` `Month._checkDateEnabled` calls `CalendarDate.fromLocalJSDate`, which throws for every rendered day and takes the whole view down, with nothing in the stack naming the binding. The EMPTY-value case this rule does not cover is closed upstream: `DateCreateObject` returns `null` for a falsy input and `isNoAbapDate` rejects anything that is not eight digits, so reporting it would now be a finding on correct code. The type mismatch is the half no guard in the formatter can see, because it is handed a string and cannot know which ABAP type produced it.',
  example: `DATA valid_from TYPE d.
" …
a( n = \`dateValue\` v = \`{ path: 'VALID_FROM', formatter: 'Formatter.DateCreateObject' }\` )`,
  remedy: `DATA valid_from TYPE timestamp.
" …
a( n = \`dateValue\` v = \`{ path: 'VALID_FROM', formatter: 'Formatter.DateCreateObject' }\` )`,
  message: (f) => `${f.member} is TYPE ${f.value}, so it reaches the model as ${f.value === 'd' || f.value === 'dats' ? '`20240101`' : '`120000`'} — Formatter.DateCreateObject is new Date( s ) and parses neither, yielding an Invalid Date, which is TRUTHY and only throws later inside the calendar (CalendarDate.fromLocalJSDate), taking the whole view down; use Formatter.DateAbapDate${f.value === 'd' || f.value === 'dats' ? '' : 'Time'}ToDateObject`,
  check,
});
