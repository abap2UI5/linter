import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'binding-type-mismatch',
  summary: 'an ABAP character field bound to a numeric or boolean UI5 property',
  detail: 'The model ships JSON, so a `TYPE string` (or `c`, `n`, `d`) field arrives as `"100"` where the property declared a float. UI5 1.71 coerces it; UI5 2.x and the render gate\'s future mode reject the view outright (`"100" is of type string, expected float`). Declare the field with the matching ABAP type, or convert it before it reaches the model. Only reported when the field\'s type is known from the class\'s own declarations.',
  example: `DATA percent TYPE string.
" … )->a( n = \`percentValue\` v = client->_bind( percent ) )`,
  remedy: `DATA percent TYPE p LENGTH 5 DECIMALS 2.
" … )->a( n = \`percentValue\` v = client->_bind( percent ) )`,
});
