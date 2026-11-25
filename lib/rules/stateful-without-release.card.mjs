import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'stateful-without-release',
  summary: 'an app that calls `set_session_stateful( abap_true )` navigates away without `set_session_stateful( abap_false )` first',
  detail: '`client->set_session_stateful( abap_true )` binds the browser to one work process until the app turns it off again - apps do it to hold an ENQUEUE lock. Every way out of the app has to release both: a `nav_app_leave( )` or a `nav_app_call( )` while the session is still stateful leaves the lock and the work process to the session timeout, and no test shows it. Judged in a class that declares `z2ui5_if_app` and calls `set_session_stateful( )` with `abap_true` or no argument (the default). Reported: each navigation not preceded in its method by `set_session_stateful( abap_false )`, written out or in a method of the class called before it (the `release_lock( )` / `on_leave( )` helper, followed a few levels deep); and once per class an `ENQUEUE_*` function call while the class names no `DEQUEUE_*` anywhere. Not reported: a class that passes the method a variable, a `nav_app_call( )` to a popup (a target class whose name contains `pop`) or in a class that takes the called app\'s result back (`id_prev_app`, `get_app( )`) - the session stays stateful on purpose while it is open. A way out the source does not spell as a client call - a launchpad back, `_event_nav_app_leave( )`, a release made on the client of an earlier roundtrip - is not seen.',
  example: `client->set_session_stateful( abap_true ).
…
WHEN \`BACK\`.
  client->nav_app_leave( ).   " still stateful`,
  remedy: `WHEN \`BACK\`.
  release_lock( ).            " DEQUEUE_… and set_session_stateful( abap_false )
  client->nav_app_leave( ).`,
});
