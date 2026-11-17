import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'navigation-lost-on-rebuild',
  summary: 'a container navigated only from a handler while a bound field keeps the page — the rebuild shows another',
  detail: 'The twin of `control-state-lost-on-rebuild` for the calls that are no setters: `to`, `backToPage`, `toDetail`, `toMaster` on a NavContainer, a SplitApp or a FlexibleColumnLayout. A container\'s current page is live control state — `view_display( )` destroys the slot and `XMLView.create` builds the container afresh on its `initialPage` — while a two-way bound field is class state and survives. A class that navigates from an event handler and KEEPS the position in such a field therefore contradicts itself after every rebuild (a draft restore, a called app handing control back, any later `view_display( )`): the field still names the page the user navigated to, the container shows the first one, and whatever reads the field — a SideNavigation\'s `selectedKey`, a breadcrumb — tells the user something that is not on screen (samples-controls app 585). Reported when a bound field names a page of that container: the call navigates to the field itself, the method that issues it copies its target into the field (or the field into the target), or a literal the field holds is the id of one of the container\'s pages. A non-literal target alone is not enough — a call to `get_event_arg( )` next to a bound SplitApp mode is correct — and the stack-relative calls (`back`, `navigateBack`) are not judged, since a rebuild empties the stack they move along. Any navigation of the SAME container from a method on the display path silences every wire on it: re-issuing `to( selectedkey )` there, guarded by the field, is the remedy, whatever argument the handler sends. A method that displays a popup counts as the display path.',
  example: `PUBLIC SECTION.
  DATA selectedkey TYPE string.
METHOD view_display.
  view->tag( \`Select\` )->a( n = \`selectedKey\` v = client->_bind( selectedkey ) ).
  client->view_display( view->stringify( ) ).
ENDMETHOD.
METHOD on_event.
  selectedkey = client->get_event_arg( ).   " the page the user picked
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`pageContainer\` ) ( \`to\` ) ( selectedkey ) ) ).
ENDMETHOD.`,
  remedy: `PUBLIC SECTION.
  DATA selectedkey TYPE string.
METHOD view_display.
  view->tag( \`Select\` )->a( n = \`selectedKey\` v = client->_bind( selectedkey ) ).
  client->view_display( view->stringify( ) ).
  IF selectedkey IS NOT INITIAL.   " the rebuilt container starts on its initialPage
    client->follow_up_action( val   = client->cs_event-control_by_id
                              t_arg = VALUE #( ( \`pageContainer\` ) ( \`to\` ) ( selectedkey ) ) ).
  ENDIF.
ENDMETHOD.
METHOD on_event.
  selectedkey = client->get_event_arg( ).
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`pageContainer\` ) ( \`to\` ) ( selectedkey ) ) ).
ENDMETHOD.`,
});
