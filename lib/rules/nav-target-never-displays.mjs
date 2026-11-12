import { defineRule } from '../rule.mjs';
import { navTargetsOf } from '../guide-rules.mjs';

function check({ src, classIndex, report }) {
  /* The first rule that reads ANOTHER class's body. `nav_app_call( )` hands
   * the screen to the called app; an app whose class neither displays
   * anything nor hands control on (a leave, a further call, a message box)
   * leaves the browser on the CALLER's view while the session sits in the
   * called app - every event of that view now arrives at a class that does
   * not handle it. Judged only for a class the run's index holds (the
   * configured paths), that declares z2ui5_if_app, has no superclass that
   * could display for it, and never hands its client to another object
   * (which may display): `shows` in classIndexOf( ) is 'no' only then. A
   * class the index does not hold is somebody else's and not judged. */
  if (!classIndex) return;
  for (const name of navTargetsOf(src)) {
    const facts = classIndex.get(name);
    if (!facts || facts.shows !== 'no' || facts.superclass) continue;
    // a class name is word characters and `/` (a namespace) - escaped whole all the same
    const literal = name.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
    const at = src.search(new RegExp(`\\bnav_app_call\\s*\\([^)]*\\b${literal}\\b`, 'i'));
    report({ value: name, offset: at < 0 ? 0 : at });
  }
}

export default defineRule({
  id: 'nav-target-never-displays',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: '`nav_app_call( )` to an app of this project that never displays anything',
  detail: 'The first rule that reads another class of the run. `client->nav_app_call( zcl_detail=>factory( ) )` hands the session to the called app - and the screen only changes when that app displays something. A class that declares `z2ui5_if_app` and contains no `view_display( )`, `popup_display( )`, `nest_view_display( )`, `nav_app_leave( )`, further `nav_app_call( )` or message box leaves the browser on the caller\'s view while every event of it now reaches a class that does not handle it. Judged only for a class the run\'s class index holds (the configured `paths`), without a superclass (which could display for it) and that never hands its `client` to another object (which could). A warning: an app that displays through a mechanism this source does not show is possible, and the waiver says why.',
  example: `client->nav_app_call( zcl_app_detail=>factory( ) ).
" zcl_app_detail: METHOD z2ui5_if_app~main. mv_count = mv_count + 1. ENDMETHOD.`,
  remedy: `client->nav_app_call( zcl_app_detail=>factory( ) ).
" zcl_app_detail: IF client->check_on_navigated( ). view_display( ). ENDIF.`,
  message: (f) => `nav_app_call( ) hands the session to ${f.value}, which never displays anything and never hands control on - the browser keeps this app's view while its events reach ${f.value}; give ${f.value} a check_on_navigated( ) branch that displays its view`,
  check,
});
