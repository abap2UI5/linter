import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'timer-tick-changes-state',
  summary: 'the handler of a timer tick sets an attribute from a value that differs on every call (opt-in)',
  detail: 'Since abap2UI5 cdd2fb25 a `START_TIMER` tick whose `main( )` left the app so that it serializes byte for byte to the draft it continued writes no draft: the framework answers with that draft\'s id. Hours of polling become one row instead of thousands - but only when the tick really changes nothing. A handler that writes the current time into an attribute ("last refreshed 12:04:31") or counts the ticks makes every tick different, and the page writes one draft per tick for as long as it is open. Reported: in the branch handling the event a `START_TIMER` follow-up action arms (its first `t_arg`) or `client->timer_set( event = … )` declares - a `WHEN` of the event `CASE`, `check_on_event( )`, `get_event( ) =`, and the methods of the class it calls - an assignment at the branch\'s own level to an instance attribute from `sy-uzeit`, `sy-datum`, `sy-timlo`, `sy-datlo`, `utclong_current( )`, `cl_abap_context_info=>get_system_time( )`/`get_system_date( )`, `GET TIME STAMP FIELD`/`GET TIME FIELD`, or the counter `x = x + 1` / `x += 1`. Not reported: an assignment from the polled data itself, one under a further `IF`, `CASE` or `LOOP` (a comparison with the previous value is the remedy), a local, a `CLASS-DATA`, and a timer whose event is not a literal. A hint and off by default (`"rules": { "timer-tick-changes-state": "hint" }`): the value is often wanted.',
  example: `CLASS zcl_poll DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_refreshed_at TYPE t.
ENDCLASS.

CLASS zcl_poll IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    CASE client->get_event( ).
      WHEN \`ARM\`.
        client->follow_up_action( val   = client->cs_event-start_timer
                                  t_arg = VALUE #( ( \`TICK\` ) ( \`5000\` ) ( \`\` ) ( \`X\` ) ) ).
      WHEN \`TICK\`.
        mv_refreshed_at = sy-uzeit.   " every tick writes a draft
    ENDCASE.
  ENDMETHOD.
ENDCLASS.`,
  remedy: `CLASS zcl_poll DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_refreshed_at TYPE t.
ENDCLASS.

CLASS zcl_poll IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    CASE client->get_event( ).
      WHEN \`ARM\`.
        client->follow_up_action( val   = client->cs_event-start_timer
                                  t_arg = VALUE #( ( \`TICK\` ) ( \`5000\` ) ( \`\` ) ( \`X\` ) ) ).
      WHEN \`TICK\`.
        " the time only when the polled data changed - or shown by the frontend
    ENDCASE.
  ENDMETHOD.
ENDCLASS.`,
});
