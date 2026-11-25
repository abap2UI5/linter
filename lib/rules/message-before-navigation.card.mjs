import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'message-before-navigation',
  summary: 'a message queued right before `nav_app_leave( )` / `nav_app_call( )` without `keep_messages = abap_true`',
  detail: 'A navigation builds the response from the TARGET app, and everything the leaving app queued in this roundtrip - toasts, message boxes - is dropped with its screen: the "Saved." of a detail page that returns to its list never shows, and nothing logs it. Since abap2UI5 cefce923 both navigation methods take `keep_messages = abap_true`, which carries the messages across the hop and shows them after the target has rendered; the default is the old behaviour. Reported at a `message_toast_display( )`, a `message_box_display( )` or a `follow_up_action( )` of `cs_event-control_global` on `MESSAGE_TOAST` / `MESSAGE_BOX`, when the same statement sequence later reaches the navigation - the scope of `display-after-nav-app-call`: a `RETURN`, `ELSE`, `WHEN` or `ENDIF` in between, or the navigation in a nested block, is another flow. Only calls written out on the client handle are read; a helper method that toasts or navigates is not followed. Not reported: a navigation that names `keep_messages` at all (a variable is the author\'s decision), a message after the navigation, and a `nav_app_call( )` to a popup app - abap2UI5\'s `z2ui5_cl_pop_*`, or a class of the run that displays a popup and no view - whose caller\'s screen stays. `keep_messages` is on abap2UI5\'s DEV branch and in no release yet: with a release configured (`abap2ui5`, `--abap2ui5`) the finding stays without a fix.',
  example: `client->message_toast_display( \`Saved.\` ).
client->nav_app_leave( ).`,
  remedy: `client->message_toast_display( \`Saved.\` ).
client->nav_app_leave( keep_messages = abap_true ).`,
});
