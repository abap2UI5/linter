import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'missing-view-display-on-navigated',
  summary: 'a `check_on_navigated( )` branch that never re-displays the view',
  detail: 'When a called app leaves, the browser still shows THAT app\'s view — returning control alone changes nothing on screen. The `check_on_navigated( )` branch has to hand a view back with `client->view_display( )`. A branch that only reads the result and falls through leaves the screen showing the wrong app, with no error anywhere. A negated guard — `IF client->check_on_navigated( ) = abap_false. RETURN. ENDIF.` — is judged on what follows it, which is the navigated path. `view_model_update( )` used to count as a re-display here and no longer does: it is an empty method now (`obsolete-model-update`), and the automatic model push that replaced it reaches the MAIN slot — which is still holding the called app\'s view. Not judged in a class that calls a method by a runtime name — itself or through a superclass of the run (`CALL METHOD lo_obj->(render_method)`, `CREATE OBJECT … TYPE (name)`): the view may come back through that call, and the rule cannot see it. Nor a branch that returns from a popup: it asks for a popups-addon class (`IS INSTANCE OF z2ui5_cl_popup_…`, `CAST z2ui5_if_popup_result`), or for a class of the run that may display a popup itself or through a superclass - the caller\'s view never left the main slot.',
  example: `IF client->check_on_init( ).
  client->view_display( render_view( ) ).
ELSEIF client->check_on_navigated( ).
  result = client->get_app( client->get( )-s_draft-id ).
ENDIF.`,
  remedy: `IF client->check_on_init( ).
  client->view_display( render_view( ) ).
ELSEIF client->check_on_navigated( ).
  result = client->get_app( client->get( )-s_draft-id ).
  client->view_display( render_view( ) ).   " without this the sub-app stays on screen
ENDIF.`,
  fixNote: `The init branch's own display statement (the same method, exactly one statement at its level that displays) is written as the navigated branch's last statement. With none or several to copy, the finding stays without a fix.`,
});
