import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'abap-date-formatter-mismatch',
  summary: 'an ABAP `TYPE d`/`TYPE t` field converted with `Formatter.DateCreateObject`',
  detail: 'The curated module ships three date helpers, and which one a field needs is decided by what its ABAP type SERIALIZES as. `DateCreateObject` is `new Date( s )` and wants a string the JS Date constructor parses — an ISO one. A `TYPE d` reaches the model as `20240101` and a `TYPE t` as `120000`, and the constructor parses neither: both come back as an **Invalid Date**. `DateAbapDateToDateObject` and `DateAbapDateTimeToDateObject` exist for exactly this and split the digits themselves. What makes it worth a rule is where it surfaces: an Invalid Date is TRUTHY, so every guard that merely checks for presence accepts it, and the throw happens much later and somewhere else — `sap.ui.unified` `Month._checkDateEnabled` calls `CalendarDate.fromLocalJSDate`, which throws for every rendered day and takes the whole view down, with nothing in the stack naming the binding. The EMPTY-value case this rule does not cover is closed upstream: `DateCreateObject` returns `null` for a falsy input and `isNoAbapDate` rejects anything that is not eight digits, so reporting it would now be a finding on correct code. The type mismatch is the half no guard in the formatter can see, because it is handed a string and cannot know which ABAP type produced it.',
  example: `DATA valid_from TYPE d.
" …
a( n = \`dateValue\` v = \`{ path: 'VALID_FROM', formatter: 'Formatter.DateCreateObject' }\` )`,
  remedy: `DATA valid_from TYPE timestamp.
" …
a( n = \`dateValue\` v = \`{ path: 'VALID_FROM', formatter: 'Formatter.DateCreateObject' }\` )`,
});
