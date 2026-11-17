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
  fixable: true,
  message: (f) => {
    return `${f.control} ${f.member}="${f.value}" is no ${f.memberType} — the XML parser only logs it, then the control's setter THROWS and the whole view fails to load; write ${f.expected}`
      + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
