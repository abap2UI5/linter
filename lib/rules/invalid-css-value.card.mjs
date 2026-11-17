import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'invalid-css-value',
  summary: '`width="100"` — a CSS size, colour or percentage UI5\'s own type check refuses',
  detail: 'Sizes, colours and percentages are string-based UI5 types (`sap.ui.core.CSSSize`, `AbsoluteCSSSize`, `CSSSizeShortHand`, `CSSColor`, `Percentage`), and each is checked by ONE regular expression in `sap/ui/core/library.js` — the snapshot carries it, and it is the same from 1.71 to the pinned release. A literal it refuses does not fall back to a default: the XML parser only logs it, then the control\'s constructor hands it to the setter, `validateProperty( )` throws `"100" is of type string, expected sap.ui.core.CSSSize for property "width"`, and the whole view fails to load. The usual shapes: a size without a unit (`100`), a blank between number and unit (`100 px`), `calc( )` without blanks around `+`/`-`, CSS keywords UI5 does not accept (`initial`, `fit-content`, `var(--x)`), a capitalised colour name (`Red`). `0`, `auto`, `inherit`, `%` and the viewport units are fine. Bindings are not judged — their value is a runtime matter — and neither is a value the reconstruction had to guess.',
  example: 'view->tag( `Button` )->a( n = `text` v = `Save` )->a( n = `width` v = `100` )',
  remedy: 'view->tag( `Button` )->a( n = `text` v = `Save` )->a( n = `width` v = `100px` )',
  fixNote: 'Only the repairs that are not a guess: blanks around the value trimmed, a blank between a number and its unit removed (`100 px` → `100px`), a colour name lower-cased (`Red` → `red`) — each only when the type then accepts the result. A bare number keeps the finding without a suggestion: `px`, `rem` and `%` are three different layouts, and choosing one is the author\'s call.',
});
