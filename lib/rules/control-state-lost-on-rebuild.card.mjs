import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'control-state-lost-on-rebuild',
  summary: 'a `CONTROL_BY_ID` `set…( )` that no binding can carry, issued only off the display path',
  detail: 'The exact inverse of `settable-property-via-action`, and its blind spot. That rule fires when the setter matches a **bindable property** and says "bind it instead"; it is silent for the three shapes where that answer does not exist — an **association** (`setNextStep`, `setSelectedSection`, `setActivePage`, `setCurrentStep`), a **function-typed property** (`sap.m.MessagePopover.asyncURLHandler`) and a method that is **no member at all** (`setBadgeMinValue`: `sap.m.Button` declares `badgeStyle` as its only badge property and keeps the bounds in private fields `Button.init` resets to 1/9999). Those three are live control state, and abap2UI5 does not patch a view — `view_display( )` hands new XML to the VIEW_SLOTS action, whose `displayMain` destroys the MAIN slot (taking POPUP and POPOVER with it) and builds a fresh tree with `XMLView.create`. Every control in it is a new object carrying what the XML declares and nothing else. A bound property survives that, because the binding re-applies; this state does not. So a class that sets it from an event handler and never re-issues it from the display path loses it on the next rebuild — a restored draft, a called app handing control back, any later `view_display( )` — while the ABAP field describing it survives as class state, and the app then contradicts itself. The remedy is to re-issue the call from the method that displays the view (samples-controls app 249 re-sends both badge bounds from the values it kept; app 534 ends `view_display( )` on the `path_apply( )` that wires the whole wizard path). Deliberately narrow: only a **non-literal** value is judged, because a constant carries no class state for the rebuilt view to contradict — `setCurrentStep( \'ProductInfoStep\' )` is a one-shot corrective jump and `setSelectedSection( \'\' )` a reset to null, and re-issuing either on every rebuild would be the defect. A wire is silent when its own method issues a display call, when any method on that path (a helper it calls, a few levels deep) issues the same id+setter, and — the same thing seen from the other side — when it is queued next to a `popup_display( )`/`popover_display( )`, since the system-action phase is awaited before the follow-up actions run.',
  example: `METHOD on_event.
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`step1\` ) ( \`setNextStep\` ) ( next_step ) ) ).
ENDMETHOD.`,
  remedy: `METHOD view_display.
  client->view_display( view->stringify( ) ).
  " the same id+setter, re-issued on every rebuild
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`step1\` ) ( \`setNextStep\` ) ( next_step ) ) ).
ENDMETHOD.`,
});
