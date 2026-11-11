import { defineRule } from '../rule.mjs';
import { insideSegments, literalSegments } from '../abap-helpers.mjs';
import { apiVerdict } from '../released-api.mjs';

/*
 * abap2UI5 objects a consumer must not name: everything outside the five of
 * `src/02`. See released-api.mjs for what the mirror knows and what it leaves
 * alone.
 */
function check({ src, report, ownObjects = null }) {
  /* An abap2UI5 object outside the released package. `src/02` is the whole
   * contract - five objects - and everything else the framework ships says
   * in its own package description that it is not for consumers: `src/01` is
   * "internal use only", `src/99` is frozen legacy kept only so existing
   * installations keep compiling. Neither side announces a change: one
   * upstream commit renamed the entire core layer (`z2ui5_cl_core_*` ->
   * `z2ui5_cl_ui5_*`) AND moved the old view builder and HTTP handler into
   * the frozen package. An app naming one of those compiles today and fails
   * to activate after the next pull, with no deprecation in between - which
   * is exactly the kind of defect this gate exists for, since no compiler
   * sees it until the object is already gone.
   *
   * Only names the mirror KNOWS are framework objects are judged (see
   * released-api.mjs): the released five are silent, the frozen package and
   * the internal prefix families are reported, and anything else is somebody
   * else's class - the samples are `z2ui5_cl_demo_app_*` and must never be
   * touched by this rule. A name inside a `…`/|…| literal is text, not a
   * reference, and the class's OWN name is not a use of itself.
   *
   * Nor is an object the linted repository DEFINES (`ownObjects`, read off
   * the abapGit file names - lib/project-index.mjs): the name family says
   * whose an object PROBABLY is, the file under `src/` says whose it is. The
   * addons number their tables `z2ui5_t_05` … `_33`, and each access to one
   * was reported as the framework's table. A framework object the
   * repository merely references is in no such list and stays reported. */
  {
    const own = new Set(
      [...src.matchAll(/\b(?:CLASS|INTERFACE)\s+(z2ui5_\w+)/gi)].map((m) => m[1].toLowerCase()),
    );
    for (const name of ownObjects ?? []) own.add(String(name).toLowerCase());
    const inLiteral = insideSegments(literalSegments(src));
    for (const m of src.matchAll(/\bz2ui5_\w+/gi)) {
      const name = m[0].toLowerCase();
      if (own.has(name) || inLiteral(m.index)) continue;
      const verdict = apiVerdict(name);
      if (!verdict) continue;
      report({
        value: name, // lower-cased: ABAP is case-insensitive, so are the findings
        member: verdict.area,
        what: verdict.what,
        replacement: verdict.replacement,
        frozen: verdict.frozen,
        moved: verdict.moved,
        offset: m.index,
      });
    }
  }
}

export default defineRule({
  id: 'non-released-api',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'class',
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
  message: (f) => `${f.value} is not part of abap2UI5's released API (src/02) — ${f.what} (${f.member}): ${
        f.moved
          ? 'no longer shipped with abap2UI5 - it compiles only where that repository is installed next to it'
          : f.frozen
            ? 'frozen legacy, kept only so existing installations keep compiling'
            : 'internal, renamed and restructured without notice'}${
        f.replacement ? `; use ${f.replacement}` : ''}`,
  check,
});
