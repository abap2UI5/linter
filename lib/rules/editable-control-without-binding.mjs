import { defineRule } from '../rule.mjs';
import { INPUT_FAMILIES, isA, isBinding, memberOf } from '../ui5-meta.mjs';

function check({ data, full, node, report }) {
  /* An input control the user can type into, whose value goes nowhere:
   * its value property is absent or a literal - no `_bind( )` to carry
   * it back - and no event on it makes a roundtrip either. The control
   * renders, accepts input, and the backend never hears of it. A hint:
   * a demo of the control's look is a legitimate shape, and so is one
   * whose value the app never needs. Judged per family through the
   * metadata (an InputBase and its descendants on `value`, a
   * CheckBox on `selected`, a Switch on `state`, a Select on
   * `selectedKey`…); a control disabled or read-only by a literal is
   * not an input and stays out. An unresolved value counts as bound:
   * the reconstructor's blind spot is not the author's. */
  for (const fam of INPUT_FAMILIES) {
    if (!isA(data, full, fam.base)) continue;
    const off = (n) => node.attrs.some(([a, v]) => a === n && String(v).trim() === 'false');
    if (off('editable') || off('enabled')) break;
    const bound = fam.props.some((p) => node.unresolvedAttrs?.has(p)
      || node.attrs.some(([a, v]) => a === p && isBinding(v)));
    const wired = node.attrs.some(([a, v]) => String(v).trim().startsWith('.eB(') && memberOf(data, full, a, ['events']));
    if (!bound && !wired) {
      report({ control: full, member: fam.props[0], offset: node.offset });
    }
    break;
  }

}

export default defineRule({
  id: 'editable-control-without-binding',
  severity: 'hint',
  category: 'data',
  scope: 'node',
  summary: 'an input the user can type into, whose value goes nowhere',
  detail: 'An Input, TextArea, CheckBox, Switch, Select, DatePicker, Slider, RatingIndicator or any of their kin whose value property is absent or a literal — no `client->_bind( )` to carry it back — and that has no event wired either. It renders, it accepts input, and the backend never hears of it. Judged per family through the metadata (an InputBase on `value`, a CheckBox on `selected`, a Switch on `state`, a Select on `selectedKey`, …); a control disabled or read-only by a literal is not an input and stays out, and a value the reconstructor could not resolve counts as bound. A hint: a demo of the control\'s look, or a value the app never needs, are legitimate shapes.',
  example: 'view->tag( `Input` )->a( n = `placeholder` v = `type here` )   " nothing reads it',
  remedy: `DATA name TYPE string.
view->tag( \`Input\` )->a( n = \`placeholder\` v = \`type here\` )->a( n = \`value\` v = client->_bind( name ) )`,
  message: (f) => `${f.control} takes user input, but its ${f.member} is not bound and no event on it reaches the backend — whatever is entered goes nowhere; bind ${f.member} with client->_bind( ) or wire an event`,
  check,
});
