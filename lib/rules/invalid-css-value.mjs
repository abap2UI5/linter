import { defineRule } from '../rule.mjs';
import { CSS_TYPES, typePattern } from '../ui5-meta.mjs';

/* The repairs of a refused CSS value that are mechanical rather than a guess,
 * tried in order; the first the type accepts is the suggestion. A bare number
 * has none on purpose - px, rem and % are three different layouts. */
function cssValueRepair(value, re) {
  const v = String(value);
  const candidates = [
    v.trim(),
    v.trim().replace(/(\d)\s+(?=[a-z%])/gi, '$1'),
    v.trim().toLowerCase(),
  ];
  return candidates.find((c) => c !== v && c !== '' && re.test(c)) ?? null;
}

function check({ attr, control, data, guessed, offset, type, value, report }) {
  /* A CSS-valued property: the string-based DataTypes UI5 checks with one
   * regex. The XML parser only LOGS a value its type refuses (parseScalarType
   * in XMLTemplateProcessor); the control's constructor then hands it to
   * setProperty, whose validateProperty THROWS - `"100" is of type string,
   * expected sap.ui.core.CSSSize for property "width"` - and the view is
   * never created. `width = '100'` is the shape: a CSS size needs a unit. */
  const re = typePattern(data, type);
  // a value the reconstruction GUESSED (a LOOP variable) is not what runs
  if (re && !guessed && !re.test(String(value))) {
    const suggestion = cssValueRepair(value, re);
    report({
      control, member: attr, value: String(value), memberType: type, offset,
      expected: CSS_TYPES.get(type),
      ...(suggestion ? { written: String(value), suggestion } : {}),
    });
  }
}

export default defineRule({
  id: 'invalid-css-value',
  severity: 'error',
  category: 'metadata',
  scope: 'node',
  summary: '`width="100"` — a CSS size, colour or percentage UI5\'s own type check refuses',
  detail: 'Sizes, colours and percentages are string-based UI5 types (`sap.ui.core.CSSSize`, `AbsoluteCSSSize`, `CSSSizeShortHand`, `CSSColor`, `Percentage`), and each is checked by ONE regular expression in `sap/ui/core/library.js` — the snapshot carries it, and it is the same from 1.71 to the pinned release. A literal it refuses does not fall back to a default: the XML parser only logs it, then the control\'s constructor hands it to the setter, `validateProperty( )` throws `"100" is of type string, expected sap.ui.core.CSSSize for property "width"`, and the whole view fails to load. The usual shapes: a size without a unit (`100`), a blank between number and unit (`100 px`), `calc( )` without blanks around `+`/`-`, CSS keywords UI5 does not accept (`initial`, `fit-content`, `var(--x)`), a capitalised colour name (`Red`). `0`, `auto`, `inherit`, `%` and the viewport units are fine. Bindings are not judged — their value is a runtime matter — and neither is a value the reconstruction had to guess.',
  example: 'view->tag( `Button` )->a( n = `text` v = `Save` )->a( n = `width` v = `100` )',
  remedy: 'view->tag( `Button` )->a( n = `text` v = `Save` )->a( n = `width` v = `100px` )',
  fixNote: 'Only the repairs that are not a guess: blanks around the value trimmed, a blank between a number and its unit removed (`100 px` → `100px`), a colour name lower-cased (`Red` → `red`) — each only when the type then accepts the result. A bare number keeps the finding without a suggestion: `px`, `rem` and `%` are three different layouts, and choosing one is the author\'s call.',
  message: (f) => {
    return `${f.control} ${f.member}="${f.value}" is no ${f.memberType} — the XML parser only logs it, then the control's setter THROWS and the whole view fails to load; write ${f.expected}`
      + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
