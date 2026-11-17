import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'non-released-api',
  summary: 'an abap2UI5 object outside the released `src/02` package',
  detail: 'abap2UI5 releases exactly one package — `src/02`, six objects: `z2ui5_if_app`, `z2ui5_if_client`, `z2ui5_if_exit`, `z2ui5_if_types`, `z2ui5_cl_ui5_http_handler`, `z2ui5_cl_ui5_view_builder`. Everything else the repository ships says in its own package description that it is not for consumers: `src/01` is "abap2UI5 — internal use only", `src/99` is frozen legacy that "ships solely so existing downstream installations keep compiling", and `src/00` holds renamed copies of AJSON, S-RTTI and abap-util. None of them carries a compatibility promise or announces a change: one upstream commit renamed the entire core layer (`z2ui5_cl_core_*` → `z2ui5_cl_ui5_*`) and moved the old view builder and HTTP handler into the frozen package on the same day. An app that names one of those compiles today and fails to activate after the next `abapGit` pull, with no deprecation in between — and nothing in a systemless pipeline says so beforehand. Judged only against names the linter knows are framework objects (the frozen package by name, the internal packages by the prefixes upstream reserves), so your own `z2ui5_`-prefixed classes are never reported - and neither is any object the linted repository defines itself, whatever family its name falls into: a `z2ui5_t_26` whose `z2ui5_t_26.tabl.xml` is under the linted paths is that repository\'s table, not the framework\'s. `z2ui5_if_types` is released rather than merely tolerated, which matters because the released `z2ui5_if_client~get( )` returns `z2ui5_if_types=>ty_s_get` — an app that declares a variable of that type cannot avoid the name.',
  example: `DATA(json) = z2ui5_cl_ajson=>create_empty( ).       " vendored copy, renamed on the next sync
z2ui5_cl_pop_to_confirm=>factory( ).                " frozen — use the popups addon
DATA(html) = z2ui5_cl_util=>xml_stringify( data ).  " retired utility class`,
  remedy: `" JSON is built and read BY HAND - there is no released parser, and
" no portable substitute (/ui2/cl_json is not released for ABAP Cloud,
" xco_cp_json is missing on 7.02). Outbound, bind the string as a node:
client->_bind( val = mv_card_manifest json = abap_true ).
" Inbound, read the one field you need - abap2UI5/samples _197 and _327:
DATA(off) = find( val = json sub = |"{ name }":"| case = abap_false ).
" the popups moved out whole: install abap2UI5-addons/popups and call it there
DATA(html) = view->xml_escape( data ).`,
});
