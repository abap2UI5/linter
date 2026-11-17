import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'redundant-init-display',
  summary: 'a lifecycle fork whose two arms do the same thing',
  detail: '`check_on_init( )` is "this app INSTANCE never ran", and it **implies** `check_on_navigated( )`: every path to an instance\'s first `main( )` raises the navigated flag too — `factory_first_start` for a fresh start and for a draft restore, `factory_system_startup`, and `prepare_app_stack` for both legs of a `nav_app_call`. The interface states it. So `IF check_on_init( ) OR check_on_navigated( )` can never change its verdict on the OR, and an init branch whose only statement is the same display call its `ELSEIF check_on_navigated( )` twin makes is four lines saying what the ELSEIF says alone. The fork is only reported where BOTH arms are one identical display call — where the navigated arm does anything else (an `on_navigation( )`, an app return handled first) the fork really does decide something and the init arm stays.',
  example: `IF client->check_on_init( ) OR client->check_on_navigated( ).   " the OR decides nothing
  client->view_display( view->stringify( ) ).
ENDIF.`,
  remedy: `IF client->check_on_navigated( ).   " on_init implies it - one branch is enough
  client->view_display( view->stringify( ) ).
ENDIF.`,
  fixNote: 'The OR form loses the `check_on_init( )` call together with the `OR` beside it, whichever side it is on; the fork loses its whole init arm — from the `IF` up to the `ELSE` of the `ELSEIF`, which then opens the block as the `IF`. Both are exact by the implication the rule rests on. A span with a comment inside it is reported without a fix, because deleting a comment nobody asked about would be a guess.',
});
