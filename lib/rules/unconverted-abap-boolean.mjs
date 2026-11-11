import { defineRule } from '../rule.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';
import { builderOfVerb } from '../builders.mjs';
import { BOOLEAN_TYPES } from '../guide-rules.mjs';

function check({ src, d, report }) {
  /* ABAP booleans are 'X' and ' ', UI5 wants "true"/"false". Writing one
   * into an attribute value puts an 'X' in the view - UI5 then reads a
   * non-empty string, so `visible = ' '` (abap_false!) turns the control
   * VISIBLE. The classic silent inversion. The way out is `a( b = )`, which
   * renders true/false itself. */
  /* One list of boolean types for every rule that reads a declaration -
   * `BOOLEAN_TYPES` in guide-rules.mjs, shared so `boole_d` and `xsdboolean`
   * are booleans here, in manual-init-flag and lifecycle-is-initial (which
   * read this `boolVars`) as they were in omit-initial-drops-false. */
  const BOOL_TYPE = BOOLEAN_TYPES;
  const boolVars = new Set();
  for (const m of src.matchAll(new RegExp(`\\b(?:CLASS-)?DATA\\s+(\\w+)\\s+TYPE\\s+(?:${BOOL_TYPE})\\b`, 'gi'))) {
    boolVars.add(m[1].toUpperCase());
  }
  /* A CHAINED declaration declares more than one name, and only the first of
   * them was ever collected — `DATA: first TYPE abap_bool, second TYPE
   * abap_bool.` left `second` unknown, so writing it into an attribute went
   * unreported while its neighbour on the line above was caught. The chain
   * runs to its terminating `.`; each element is `name TYPE type`. */
  for (const chain of src.matchAll(/\b(?:CLASS-)?DATA:([\s\S]*?)\.\s*$/gim)) {
    for (const m of chain[1].matchAll(new RegExp(`(\\w+)\\s+TYPE\\s+(?:${BOOL_TYPE})\\b`, 'gi'))) {
      boolVars.add(m[1].toUpperCase());
    }
  }
  /* ->a( n = `x` v = <expr> ) with an ABAP flag behind `v`, where the `v`
   * token itself is what the correction replaces. A flag passed through
   * `b =` never matches: the rule asks for a `v` argument. The arguments are
   * read by name, in whatever order they were written - `a( v = mv_flag n =
   * `visible` )` is the same call - and a flag spelled `me->mv_flag` is the
   * declared flag. */
  for (const m of src.matchAll(new RegExp(`->\\s*(${d.att})\\s*\\(`, 'gi'))) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    const marks = namedArgMarks(body);
    const nArg = marks.find((a) => a.name === 'n');
    const vArg = marks.find((a) => a.name === 'v');
    if (!nArg || !vArg) continue;
    const attrLit = nArg.value.match(/^[`'|]([\w:]+)[`'|]$/);
    if (!attrLit) continue;
    const attr = attrLit[1];
    const verb = m[1];
    const builder = builderOfVerb(verb);
    const value = vArg.value;
    if (/as_bool\s*\(/i.test(value) || /_bind\w*\s*\(/i.test(value)) continue;
    const name = value.replace(/^me->/i, '');
    const isAbapBool =
      /^abap_(true|false|undefined)$/i.test(name) ||
      (/^\w+$/.test(name) && boolVars.has(name.toUpperCase())) ||
      /^(?:me->)?\w*client->check_\w+\s*\(\s*\)$/i.test(value) ||
      /^xsdbool\s*\(/i.test(value) ||
      /^boolc\s*\(/i.test(value);
    if (isAbapBool) {
      /* Autofixable only for a bare token (abap_true, a declared flag): those
       * convert without changing what is evaluated. An expression is left
       * alone - a fix that has to guess where the value ends is not a fix.
       *
       * The correction is the parameter NAME: `v` becomes `b`, and the value
       * stays untouched - the builder renders the flag itself. */
      const bare = /^\w+$/.test(name);
      const at = open + 1 + vArg.nameStart;
      const fixes = !bare || !builder.bool ? null
        : [{ start: at, end: at + 1, text: builder.bool }];
      report({
        member: attr, value: value.slice(0, 40),
        fixHint: builder.boolFix, offset: m.index,
        ...(fixes ? { fixes } : {}),
      });
    }
  }

  /* Handed back because manual-init-flag needs it too: the flag it looks for
   * is a declared ABAP boolean, and collecting the declarations a second time
   * would be two regexes to keep in step. */
  return boolVars;
}

export default defineRule({
  id: 'unconverted-abap-boolean',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  summary: 'an ABAP boolean written straight into the view',
  detail: 'It arrives as `\'X\'` or `\' \'`, and UI5 reads any non-empty string as true — so `visible = abap_false` makes the control **visible**. The classic silent inversion. The way out is the builder\'s own boolean parameter: `z2ui5_cl_ui5_view_builder` takes the flag through `a( b = … )`, which renders `true`/`false` itself.',
  example: `DATA flag TYPE abap_bool.
view->tag( \`Button\` )->a( n = \`visible\` v = flag )   " 'X' / ' ' - both truthy`,
  remedy: `DATA flag TYPE abap_bool.
view->tag( \`Button\` )->a( n = \`visible\` b = flag )   " the builder renders true/false`,
  fixNote: 'A bare token is moved onto the boolean parameter — `a( v = flag )` becomes `a( b = flag )`; an expression is left alone.',
  message: (f) => `${f.member}: the ABAP boolean ${f.value} reaches the view as 'X'/' ' — ${
        f.fixHint || 'pass it as a( b = … ), which renders true/false itself'}`,
  check,
});
