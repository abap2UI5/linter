import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'raw-javascript-to-frontend',
  summary: 'raw JavaScript shipped to the browser — via `follow_up_action` or the view',
  detail: 'abap2UI5\'s frontend is a **renderer**: behaviour travels as data (bindings, `cs_event-` actions), never as code. Five shapes break that line, all invisible to every gate and to anyone reading the ABAP: a non-name `val` in `follow_up_action( )` (the raw-JS escape hatch — inserted verbatim as `custom_js`), a hand-written handler string on an event attribute (UI5 evaluates it as JavaScript), a `<script>` tag inside an attribute value (the `core:HTML` route), an inline `on…=` handler on an element of such markup, and a `javascript:` URL in a URI-typed property (`href`, `src`). The last two do not even run: the default content security policy carries no `\'unsafe-inline\'`, so the browser refuses them and says so in the console only. Use a `cs_event-` frontend action, a `client->_event*( )` wire or backend logic instead. A repo that deliberately allows the escape hatch can lower or disable the rule in its `abap2ui5lint.jsonc`.',
  example: 'client->follow_up_action( val = `sap.ui.getCore().byId(\'x\').focus()` ).   " raw JS',
  remedy: 'client->follow_up_action( val = client->cs_event-set_focus t_arg = VALUE #( ( `x` ) ) ).',
});
