import { defineRule } from '../rule.mjs';
import { handsOutStringify } from '../lifecycle-rules.mjs';

function check({ src, d, report }) {
  /* A view that is built but never handed to the client renders nothing -
   * an empty page with no error anywhere. Only reported when the class
   * builds a view itself and no display/handover call appears at all. The
   * display family is complete on purpose: a popover-only or nested-view
   * helper class is legitimate, and the rule reporting one was the false
   * positive the extension's snippet gate caught. */
  const factory = src.match(new RegExp(`${d.factory}\\s*\\(`, 'i'));
  if (factory
      && !/((?:nest2?_)?view_display|popup_display|popover_display|nav_app_call|nav_app_leave)\s*\(/i.test(src)
      && !handsOutStringify(src)) {
    report({ offset: factory.index });
  }
}

export default defineRule({
  id: 'view-never-displayed',
  severity: 'error',
  category: 'lifecycle',
  scope: 'app',
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
  message: (f) => 'a view is built but never displayed — client->view_display( ) is missing',
  check,
});
