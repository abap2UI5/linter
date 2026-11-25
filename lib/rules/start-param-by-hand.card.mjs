import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'start-param-by-hand',
  summary: 'an app reads its start parameter from `t_comp_params` or with `url_param_get( )` on `s_config-search` instead of `client->get_start_param( )`',
  detail: 'An app is started three ways, and each carries its parameters somewhere else: `?lgn=0001` on the URL, a `startupParameters` entry of a launchpad tile, or the query of a launchpad intent `#Object-action?lgn=0001`. An app that reads one source by hand works the way its author tested it and silently starts empty the other ways; the copies that exist read two of the three, upper-case the value whether or not the key wants it, and drift apart. `client->get_start_param( name )` reads all three in a fixed order and matches the name in any case. Reported in a class implementing `z2ui5_if_app`: a read of `t_comp_params` of `client->get( )` (directly, in a `READ TABLE`, a table expression or a `LOOP AT`, or of a variable assigned from `client->get( )`), and a call of `url_param_get( )` / `url_param_get_tab( )` whose arguments hold `client->get( )-s_config-search` or a variable assigned from it. `s_config-search` and `s_config-hash` read for anything else - the origin, a route, a debug flag on the URL - are not reported, nor is a class that is not an app. A variable is followed through one plain assignment in the same class; a value handed to a helper method is not followed. A hint: `get_start_param( )` is only there on an abap2UI5 that has it.',
  example: `DATA(lv_lgn) = z2ui5_cl_util=>url_param_get( val = \`lgn\` url = client->get( )-s_config-search ).
IF lv_lgn IS INITIAL.
  lv_lgn = VALUE #( client->get( )-t_comp_params[ n = \`LGN\` ]-v OPTIONAL ).
ENDIF.`,
  remedy: 'DATA(lv_lgn) = client->get_start_param( `lgn` ).',
});
