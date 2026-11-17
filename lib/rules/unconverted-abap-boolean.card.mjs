import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unconverted-abap-boolean',
  summary: 'an ABAP boolean written straight into the view',
  detail: 'It arrives as `\'X\'` or `\' \'`, and UI5 reads any non-empty string as true — so `visible = abap_false` makes the control **visible**. The classic silent inversion. The way out is the builder\'s own boolean parameter: `z2ui5_cl_ui5_view_builder` takes the flag through `a( b = … )`, which renders `true`/`false` itself.',
  example: `DATA flag TYPE abap_bool.
view->tag( \`Button\` )->a( n = \`visible\` v = flag )   " 'X' / ' ' - both truthy`,
  remedy: `DATA flag TYPE abap_bool.
view->tag( \`Button\` )->a( n = \`visible\` b = flag )   " the builder renders true/false`,
  fixNote: 'A bare token is moved onto the boolean parameter — `a( v = flag )` becomes `a( b = flag )`; an expression is left alone.',
});
