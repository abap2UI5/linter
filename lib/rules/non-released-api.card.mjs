import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'non-released-api',
  summary: 'an abap2UI5 object outside the released `src/02` package',
  detail: 'abap2UI5 releases exactly one package — `src/02`: `z2ui5_if_app`, `z2ui5_if_client`, `z2ui5_if_ui5_exit`, `z2ui5_cl_ui5_http_handler`, `z2ui5_cl_ui5_view_builder`, the test harness `z2ui5_cl_ui5_test`, the monitor seam `z2ui5_if_ui5_monitor` and the language model seam `z2ui5_if_ui5_llm` / `z2ui5_cl_ui5_llm` / `z2ui5_cx_ui5_llm`. Everything else the repository ships says in its own package description that it is not for consumers: `src/01` is "abap2UI5 — internal use only", and `src/00` holds renamed copies of AJSON, S-RTTI and abap-util. None of them carries a compatibility promise or announces a change: one upstream commit renamed the entire core layer (`z2ui5_cl_core_*` → `z2ui5_cl_ui5_*`). An app that names one of those compiles today and fails to activate after the next `abapGit` pull, with no deprecation in between — and nothing in a systemless pipeline says so beforehand. The former frozen package `src/99` — the old view builders `z2ui5_cl_xml_view` / `z2ui5_cl_xml_view_cc`, the retired `z2ui5_if_types`, the built-in `z2ui5_cl_pop_*` popups and the `z2ui5_cl_util*` utilities — left abap2UI5 for the separate repository abap2UI5/abap2UI5-ext (complete since 1.151.0): those names compile only where that repository is installed next to abap2UI5, and each finding names what replaced it. `z2ui5_cl_http_handler` and `z2ui5_if_exit` are deleted outright. Judged only against names the linter knows are framework objects (the moved and deleted objects by name, the internal packages by the prefixes upstream reserves), so your own `z2ui5_`-prefixed classes are never reported - and neither is any object the linted repository defines itself, whatever family its name falls into: a `z2ui5_t_26` whose `z2ui5_t_26.tabl.xml` is under the linted paths is that repository\'s table, not the framework\'s - nor `z2ui5_cl_pop_to_confirm` in a repository that is abap2UI5-ext itself.',
  example: `DATA(json) = z2ui5_cl_ui5_ajson=>create_empty( ).   " vendored copy, not a released API
z2ui5_cl_pop_to_confirm=>factory( ).                " moved to abap2UI5-ext — use the popups addon
DATA(html) = z2ui5_cl_util=>xml_stringify( data ).  " retired utility class, abap2UI5-ext`,
  remedy: `" JSON is built and read BY HAND - there is no released parser, and
" no portable substitute (/ui2/cl_json is not released for ABAP Cloud,
" xco_cp_json is missing on 7.02). Outbound, bind the string as a node:
client->_bind( val = mv_card_manifest json = abap_true ).
" Inbound, read the one field you need - abap2UI5/samples _197 and _327:
DATA(off) = find( val = json sub = |"{ name }":"| case = abap_false ).
" the popups moved out whole: install abap2UI5-addons/popups and call it there
DATA(html) = view->xml_escape( data ).`,
});
