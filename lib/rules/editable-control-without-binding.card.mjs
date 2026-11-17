import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'editable-control-without-binding',
  summary: 'an input the user can type into, whose value goes nowhere',
  detail: 'An Input, TextArea, CheckBox, Switch, Select, DatePicker, Slider, RatingIndicator or any of their kin whose value property is absent or a literal — no `client->_bind( )` to carry it back — and that has no event wired either. It renders, it accepts input, and the backend never hears of it. Judged per family through the metadata (an InputBase on `value`, a CheckBox on `selected`, a Switch on `state`, a Select on `selectedKey`, …); a control disabled or read-only by a literal is not an input and stays out, and a value the reconstructor could not resolve counts as bound. A hint: a demo of the control\'s look, or a value the app never needs, are legitimate shapes.',
  example: 'view->tag( `Input` )->a( n = `placeholder` v = `type here` )   " nothing reads it',
  remedy: `DATA name TYPE string.
view->tag( \`Input\` )->a( n = \`placeholder\` v = \`type here\` )->a( n = \`value\` v = client->_bind( name ) )`,
});
