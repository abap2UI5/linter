import { defineRule } from '../rule.mjs';
import { bindingPath } from '../binding-paths.mjs';

function check({ attr, full, jsonPaths, member, offset, value, report }) {
  /* A json-spliced bind on a scalar-typed property. `_bind( json =
   * abap_true )` splices the bound string into the model as a JSON
   * NODE — meant for a property typed object/any (a Card manifest),
   * which no typed ABAP value can be. On a string/int/float/boolean
   * property the spliced node arrives as the wrong JSON type (strict
   * mode and UI5 2.x reject it), and the splice is OUTBOUND-only:
   * the return path skips json attributes, so an edit made through a
   * two-way binding is silently discarded on the next roundtrip. */
  if (jsonPaths?.size && member.set === 'properties'
      && ['string', 'int', 'float', 'boolean'].includes(member.decl?.type)) {
    const jp = bindingPath(value);
    if (jp && jsonPaths.has(jp)) {
      report({ control: full, member: attr, value: jp, memberType: member.decl.type, offset });
    }
  }
}

export default defineRule({
  id: 'json-bind-on-scalar-property',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
  summary: 'a `json = abap_true` bind on a scalar-typed property',
  detail: '`_bind( json = abap_true )` splices the bound string into the model as a JSON **node** — built for properties typed `object`/`any` (an integration Card\'s manifest), which no typed ABAP value can be. On a `string`/`int`/`float`/`boolean` property the spliced node arrives as the wrong JSON type — strict mode and UI5 2.x reject it — and the splice is **outbound-only**: the return path skips json attributes, so an edit made through a two-way binding is silently discarded on the next roundtrip. Bind the plain attribute instead; json is for objects.',
  example: `DATA manifest TYPE string.   " contains JSON
)->a( n = \`value\` v = client->_bind( val = manifest json = abap_true ) )`,
  remedy: `DATA manifest TYPE string.
)->a( n = \`value\` v = client->_bind( manifest ) )   " Input.value is string-typed`,
  fixNote: 'The `json = abap_true` argument is deleted from the `_bind( )`, together with the whitespace in front of it — `_bind( val = manifest json = abap_true )` becomes `_bind( val = manifest )`, the plain bind of the same attribute. Found from the reported attribute write: its argument list, the first `_bind( )` in it, and that one argument; a call written any other way is reported without a fix.',
  message: (f) => `${f.control} ${f.member} is a ${f.memberType} property bound to the json-spliced {${f.value}} — the spliced JSON node is not a ${f.memberType}, and the splice is outbound-only, so an edit is silently discarded; json = abap_true belongs on an object-typed property`,
  check,
});
