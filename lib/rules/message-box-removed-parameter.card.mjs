import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'message-box-removed-parameter',
  summary: 'a parameter `message_box_display( )` / `message_toast_display( )` no longer has',
  detail: 'abap2UI5#2748 (2026-09-13) took the pure UI5 options off both signatures: `textdirection`, `icon`, `closeonnavigation`, `dependenton` and `contentwidth` on the box, `width`, `my`, `at`, `of`, `offset`, `collision`, `autoclose`, `animationtimingfunction`, `animationduration`, `closeonbrowsernavigation` and `class` on the toast. What the method carries now is what an ABAP app decides — the data, the kind of box, the buttons, the closing event — and a plain UI5 option is set on the CONTROL through the whitelisted global call, whose last argument is the option object 1:1. A call naming a removed parameter does not compile on a current pin, and a systemless pipeline sees that only when somebody imports the transport. No fix: the value moves into a different call.',
  example: 'client->message_box_display( text = `Not saved.` type = `error` icon = `WARNING` contentwidth = `30rem` ).',
  remedy: 'client->follow_up_action( val = client->cs_event-control_global t_arg = VALUE #( ( `MESSAGE_BOX` ) ( `error` ) ( `Not saved.` ) ( `\\{"contentWidth":"30rem","icon":"WARNING"\\}` ) ) ).',
});
