import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'obsolete-frontend-event',
  summary: '`client->_event_client( )` — superseded by `client->follow_up_action( )`',
  detail: 'The same call, with the same `val` / `view` / `t_arg`. Since `follow_up_action( )` gained a `RETURNING` parameter it is the same call in the same *position* too: where its result is consumed — the view-attribute form `v = client->_event_client( … )` — it takes the `IF result IS SUPPLIED` branch straight to `mo_srv_event->get_event_client( )`, which is `_event_client( )`\'s entire body. One method now both schedules a frontend action and wires one, so the second name is a leftover. The one non-equivalence is `follow_up_action( )`\'s `CASE`, which intercepts `cs_event-set_nav_routing` / `set_push_state` / `set_app_state_active` before that branch: those three are backend-side navigation options, not frontend handlers, so a view attribute wired to one of them never dispatched anyway.',
  example: 'a( n = `press` v = client->_event_client( val = client->cs_event-popup_close ) )',
  remedy: 'a( n = `press` v = client->_event( `CLOSE` ) )   " …and popup_destroy( ) in the handler',
  fixNote: 'Rewritten to `client->follow_up_action( )`, the arguments untouched.',
});
