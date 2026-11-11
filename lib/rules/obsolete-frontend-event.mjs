import { defineRule } from '../rule.mjs';

function check({ code, report }) {
  /* _event_client is obsolete - follow_up_action is the same call, and since
   * it gained a RETURNING parameter it is the same call in the same POSITION
   * too. Both delegate to mo_srv_event->get_event_client( val view t_arg )
   * with the identical arguments; follow_up_action reaches it through
   * `IF result IS SUPPLIED`, which is exactly the view-attribute form
   * `v = client->_event_client( … )` is written in. One method for scheduling
   * a frontend action and wiring one, so the rename is a pure one.
   *
   * The one non-equivalence is in follow_up_action's CASE, which intercepts
   * cs_event-set_nav_routing / set_push_state / set_app_state_active before
   * the expression path: those three are backend-side nav options, not
   * frontend handlers, so a view attribute wired to one of them never worked
   * (the dispatch table has no such name) - the fix does not preserve a
   * behaviour, it removes a wire that was already silent. */
  for (const m of code.matchAll(/client->(_event_client)\s*\(/gi)) {
    const token = m.index + m[0].indexOf(m[1]);
    report({
      member: m[1], offset: m.index,
      fixes: [{ start: token, end: token + m[1].length, text: 'follow_up_action' }],
    });
  }
}

export default defineRule({
  id: 'obsolete-frontend-event',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: '`client->_event_client( )` — superseded by `client->follow_up_action( )`',
  detail: 'The same call, with the same `val` / `view` / `t_arg`. Since `follow_up_action( )` gained a `RETURNING` parameter it is the same call in the same *position* too: where its result is consumed — the view-attribute form `v = client->_event_client( … )` — it takes the `IF result IS SUPPLIED` branch straight to `mo_srv_event->get_event_client( )`, which is `_event_client( )`\'s entire body. One method now both schedules a frontend action and wires one, so the second name is a leftover. The one non-equivalence is `follow_up_action( )`\'s `CASE`, which intercepts `cs_event-set_nav_routing` / `set_push_state` / `set_app_state_active` before that branch: those three are backend-side navigation options, not frontend handlers, so a view attribute wired to one of them never dispatched anyway.',
  example: 'a( n = `press` v = client->_event_client( val = client->cs_event-popup_close ) )',
  remedy: 'a( n = `press` v = client->_event( `CLOSE` ) )   " …and popup_destroy( ) in the handler',
  fixNote: 'Rewritten to `client->follow_up_action( )`, the arguments untouched.',
  message: (f) => `client->${f.member}( ) is obsolete — use client->follow_up_action( ), which reaches the same get_event_client( ) wherever its result is consumed; one method schedules a frontend action and wires one`,
  check,
});
