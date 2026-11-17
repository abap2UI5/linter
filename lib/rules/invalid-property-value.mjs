import { defineRule } from '../rule.mjs';
import { caseMatch } from '../suggest.mjs';

const isNumericType = (t) => t === 'int' || t === 'float';
/* DataType's `int`/`float` parseValue: "" is NaN (valid for both), anything
 * else goes through Number( ) - an int has to come out an integer, a float a
 * number. */
const numericValueValid = (type, text) => {
  if (text === '') return true;
  const n = Number(text);
  return type === 'int' ? Number.isInteger(n) : !Number.isNaN(n);
};

/* Two shapes, by what the walk's checkValue( ) hands it: a closed set
 * (`allowed`: an enum's view spellings, `enumKeys` with them, or the two
 * booleans) and a numeric type. Returns whether a closed-set value was
 * refused - an accepted one is judged for its release next. */
function check({ allowed, attr, control, enumKeys, guessed, offset, type, value, report }) {
  if (allowed) {
    const written = value;
    if (allowed.includes(written)) return false;
    /* The one wrong spelling this gate can name outright: the RUNTIME
     * value of an enum whose key differs from it. It is not a typo and
     * caseMatch would never find it (`One Month` vs `OneMonth` differ by a
     * space, `sapIllus-NoData` vs `NoData` by a prefix) - it is the
     * spelling the API reference prints, written into the one place that
     * does not take it. Carried on the finding so the message can say so,
     * and as written/suggestion so --fix can repair it. */
    const key = enumKeys ? enumKeys[type]?.[written] : undefined;
    const suggestion = key || caseMatch(written, allowed);
    report({
      control, member: attr, value: written, allowed, memberType: type, offset,
      ...(key ? { enumValueForm: true } : {}),
      ...(suggestion ? { written, suggestion } : {}),
    });
    return true;
  }
  /* What DataType's parseValue/isValid accept, nothing narrower: `Number( )`
   * of the text (`.5`, `5.`, `1e3`, ` 10 ` are numbers), an int only when
   * that is an integer, and the empty string - NaN, which both types take.
   * `^[+-]?\d+(\.\d+)?$` reported those as invalid, and a value the
   * reconstruction GUESSED (a LOOP variable, which comes out empty) too. */
  if (isNumericType(type) && !guessed && !numericValueValid(type, value)) {
    report({ control, member: attr, value, memberType: type, offset });
  }
  return false;
}

export default defineRule({
  id: 'invalid-property-value',
  severity: 'error',
  category: 'metadata',
  scope: 'node',
  fixable: true,
  message: (f) => {
    /* The enum-VALUE form gets its own sentence: "not a valid value" is
     * exactly what its author will dispute, because the API reference
     * prints that string. What is wrong is not the value but the PLACE -
     * an XML attribute is parsed key -> value before it is validated. */
    if (f.enumValueForm) {
      return `${f.control} ${f.member}="${f.value}" is the enum VALUE, and an XML view attribute is `
        + `parsed with parseValue( ) — which maps KEY → value — before it is validated: "${f.value}" `
        + `parses to undefined, so UI5 logs an error and the property keeps its default. `
        + `Write the key: ${f.suggestion}${f.allowed ? ` (allowed: ${[].concat(f.allowed).join(', ')})` : ''}`;
    }
    return `${f.control} ${f.member}="${f.value}" is not a valid value (${
      f.allowed ? `allowed: ${[].concat(f.allowed).join(', ')}` : `expected ${f.memberType}`})` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
