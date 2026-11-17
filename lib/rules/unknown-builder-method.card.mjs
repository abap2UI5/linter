import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-builder-method',
  summary: 'a method `z2ui5_cl_ui5_view_builder` does not have — `->page( )`, `->input( )`: the frozen builder\'s API on the current one',
  detail: 'The view builder has four verbs and a renderer: `ele( )`, `tag( )`, `a( )`, `end( )` and `stringify( )`, plus the static `factory( )` and `escape_literal( )`. The frozen `z2ui5_cl_xml_view` had one method per control - `->page( )`, `->input( )`, `->button( )` - and every tutorial on the public web shows that API, so it is what an answer from memory writes, even when it names the current class. Such a class does not activate, and it reconstructs no view, so it used to pass as "no view built" with nothing reported. Judged on a statement that starts from the builder class or from a handle of it (declared `TYPE REF TO z2ui5_cl_ui5_view_builder`, or captured from a builder call); only the chain\'s own calls are read, so an argument like `client->_bind( … )` is not one. Write the control as `ele( \\`Page\\` )` / `tag( \\`Input\\` )` and its properties with `a( n = … v = … )`.',
  example: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( \`Page\` )->input( value = client->_bind( mv_text ) ).`,
  remedy: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( \`Page\` )->tag( \`Input\` )->a( n = \`value\` v = client->_bind( mv_text ) ).`,
});
