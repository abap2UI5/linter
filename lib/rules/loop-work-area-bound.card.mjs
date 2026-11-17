import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'loop-work-area-bound',
  summary: 'a `_bind( )` on the work area of a LOOP — one path for every row',
  detail: 'A view built per row of a table, binding the row through the loop\'s work area. Three shapes, none of them a row binding: a work area that is an attribute (`LOOP AT mt INTO ms_row`) binds ONE path, `/MS_ROW/FIELD`, so every row\'s control shows the last row\'s value; a local (`INTO DATA(row)`) or a field symbol (`ASSIGNING <row>`) binds a path the model never carries, and the first roundtrip answers BINDING_ERROR. The framework\'s answer is the cell binding: `_bind( val = <row>-field tab = mt tab_index = sy-tabix )`, a `/MT/<n>/FIELD` path — and `val` has to BE the row component, a reference into the table, which is what ASSIGNING gives and INTO does not. A call that already carries `tab =` is that remedy and is not reported. The other way round is usually better still: bind the table on the aggregation and keep the template\'s fields relative.',
  example: `LOOP AT mt_rows ASSIGNING FIELD-SYMBOL(<row>).
  view->tag( \`Input\` )->a( n = \`value\` v = client->_bind( <row>-name ) ).
ENDLOOP.`,
  remedy: `LOOP AT mt_rows ASSIGNING FIELD-SYMBOL(<row>).
  view->tag( \`Input\` )->a( n = \`value\` v = client->_bind( val = <row>-name tab = mt_rows tab_index = sy-tabix ) ).
ENDLOOP.`,
  fixNote: 'For the ASSIGNING shape, where the call carries only `val` and nothing between the loop header and the call has moved `sy-tabix` (no READ TABLE, inner LOOP or DO): the call becomes `_bind( val = <row>-field tab = <table> tab_index = sy-tabix )`. An INTO work area is a copy the framework refuses as a cell, so that shape keeps the finding.',
});
