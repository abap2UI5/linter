import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'nav-target-never-displays',
  summary: '`nav_app_call( )` to an app of this project that never displays anything',
  detail: 'The first rule that reads another class of the run. `client->nav_app_call( zcl_detail=>factory( ) )` hands the session to the called app - and the screen only changes when that app displays something. A class that declares `z2ui5_if_app` and contains no `view_display( )`, `popup_display( )`, `nest_view_display( )`, `nav_app_leave( )`, further `nav_app_call( )` or message box leaves the browser on the caller\'s view while every event of it now reaches a class that does not handle it. Judged only for a class the run\'s class index holds (the configured `paths`), without a superclass (which could display for it) and that never hands its `client` to another object (which could). A warning: an app that displays through a mechanism this source does not show is possible, and the waiver says why.',
  example: `client->nav_app_call( zcl_app_detail=>factory( ) ).
" zcl_app_detail: METHOD z2ui5_if_app~main. mv_count = mv_count + 1. ENDMETHOD.`,
  remedy: `client->nav_app_call( zcl_app_detail=>factory( ) ).
" zcl_app_detail: IF client->check_on_navigated( ). view_display( ). ENDIF.`,
});
