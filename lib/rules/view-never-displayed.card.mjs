import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'view-never-displayed',
  summary: 'a view is built but never handed to the client',
  detail: 'An empty page and no error: the builder ran, the result was never passed to `client->view_display( )` (or a nested-view, popup, popover or nav call).',
  example: `METHOD z2ui5_if_app~main.
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( \`Page\` )->tag( \`Button\` ).
ENDMETHOD.`,
  remedy: `METHOD z2ui5_if_app~main.
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( \`Page\` )->tag( \`Button\` ).
  client->view_display( view->stringify( ) ).
ENDMETHOD.`,
});
