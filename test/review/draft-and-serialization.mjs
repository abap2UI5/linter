/*
 * Two things an app hands to the next roundtrip that do not survive it.
 * Added 2026-11-25 from two abap2UI5 backlog items.
 *
 *   - draft-id-as-link: a link or bookmark built from get( )-s_draft-id.
 *     abap2UI5 04ead8ec keeps two drafts per chain and cdd2fb25 writes none
 *     on an unchanged timer tick, so the id is gone two roundtrips later;
 *     app_state_get_href( ) is the link whose draft is kept.
 *   - nonserializable-attribute: an app attribute TYPE REF TO a class
 *     without if_serializable_object, which the draft leaves out without a
 *     word (z2ui5_cl_ui5_srv_model, ltcl_05_draft->dead_objects_stay_quiet).
 */
import { classIndexOf, classIndexDeps } from '../../lib/guide-rules.mjs';

const app = (body, { decl = '', methods = '', name = 'zcl_draft_app', head = '', intf = true } = {}) =>
  `CLASS ${name} DEFINITION PUBLIC${head}.\n  PUBLIC SECTION.\n`
  + (intf ? '    INTERFACES z2ui5_if_app.\n' : '')
  + '    DATA mv_text TYPE string.\n' + decl
  + `ENDCLASS.\n\nCLASS ${name} IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n${body}\n  ENDMETHOD.\n${methods}ENDCLASS.\n`;

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, minUi5: '1.71' };
  const of = (src, type, more = {}) => checkAbapSource(src, { ...opts, ...more }).findings.filter((x) => x.type === type);

  /* ── draft-id-as-link ─────────────────────────────────────────────── */
  const drafts = (body) => of(app(body), 'draft-id-as-link');

  section('draft-id-as-link: the shapes that hand the draft id out', () => {
    const tpl = drafts('    DATA(lv_link) = |{ mv_text }#/z2ui5-xapp-state={ client->get( )-s_draft-id }|.\n'
      + '    client->follow_up_action( val = client->cs_event-clipboard_copy t_arg = VALUE #( ( lv_link ) ) ).');
    assert(tpl.length === 1 && tpl[0].value === 's_draft-id' && tpl[0].member === 'link', `a template with # - once, at the read (${JSON.stringify(tpl.map((x) => [x.value, x.member]))})`);
    assert(/app_state_get_href/.test(tpl[0].message ?? ''), 'the message names app_state_get_href( )');

    assert(drafts('    DATA(lv_url) = |https://host/app?id={ client->get( )-s_draft-id_prev }|.')[0]?.value === 's_draft-id_prev', 'id_prev in a URL');
    assert(drafts('    DATA(ls_get) = client->get( ).\n    DATA(lv_l) = |sap-xapp={ ls_get-s_draft-id }|.').length === 1, 'through a variable holding get( )');
    assert(drafts('    DATA(ls_d) = client->get( )-s_draft.\n    DATA(lv_l) = |{ mv_text }?id={ ls_d-id }|.').length === 1, 'through a variable holding get( )-s_draft');
    assert(drafts('    DATA(lv_id) = client->get( )-s_draft-id.\n    DATA(lv_l) = |{ lv_base_url }{ lv_id }|.').length === 1, 'one level of assignment, a URL-named variable in the template');
    assert(drafts('    DATA(lv_id) = client->get( )-s_draft-id.\n    mv_text = lv_flp_url && lv_id.').length === 1, 'a concatenation with a URL-named variable');
    assert(drafts('    DATA(lv_id) = client->get( )-s_draft-id.\n    CONCATENATE `https://x/#` lv_id INTO mv_text.').length === 1, 'CONCATENATE with a URL literal');
    const act = drafts('    DATA(lv_id) = client->get( )-s_draft-id.\n    client->follow_up_action( val = client->cs_event-open_new_tab t_arg = VALUE #( ( lv_id ) ) ).');
    assert(act.length === 1 && act[0].member === 'action', 'OPEN_NEW_TAB with the id');
    const db = drafts('    DATA ls_mark TYPE zbookmark.\n    ls_mark-draft = client->get( )-s_draft-id.\n    INSERT zbookmark FROM ls_mark.');
    assert(db.length === 1 && db[0].member === 'database', `a stored bookmark (${JSON.stringify(db.map((x) => x.member))})`);
    assert(drafts('    DATA(lv_id) = client->get( )-s_draft-id.\n    UPDATE zbookmark SET draft = @lv_id WHERE uname = @sy-uname.').length === 1, 'UPDATE of a database table');
    const att = drafts('    DATA(lv_id) = client->get( )-s_draft-id.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->tag( `Link` )->a( n = `href` v = lv_id ).\n    client->view_display( view->stringify( ) ).');
    assert(att.length === 1 && att[0].member === 'attribute', `an href attribute (${JSON.stringify(att.map((x) => x.member))})`);
    assert(drafts('    DATA(lv_id) = CLIENT->GET( )-S_DRAFT-ID.\n    DATA(LV_L) = |#{ LV_ID }|.').length === 1, 'any case');
  });

  section('draft-id-as-link: what is not reported', () => {
    assert(drafts('    DATA(lv_link) = client->app_state_get_href( ).\n    client->follow_up_action( val = client->cs_event-clipboard_copy t_arg = VALUE #( ( lv_link ) ) ).').length === 0, 'app_state_get_href( )');
    assert(drafts('    MESSAGE |draft { client->get( )-s_draft-id } at http://x| TYPE `S`.').length === 0, 'a MESSAGE');
    assert(drafts('    lo_log->add( |http://x#{ client->get( )-s_draft-id }| ).').length === 0, 'a log call');
    assert(drafts('    client->message_toast_display( |#{ client->get( )-s_draft-id }| ).').length === 0, 'a message toast');
    assert(drafts('    mv_text = |Draft { client->get( )-s_draft-id }|.').length === 0, 'a text without a URL part');
    assert(drafts('    IF mv_text = client->get( )-s_draft-id.\n      RETURN.\n    ENDIF.').length === 0, 'a comparison');
    assert(drafts('    DATA(lv_id) = client->get( )-s_draft-id.\n    IF lv_id <> mv_text.\n      mv_text = lv_id.\n    ENDIF.').length === 0, 'a comparison through a variable');
    assert(drafts('    client->nav_app_leave( client->get_app( client->get( )-s_draft-id_prev ) ).').length === 0, 'a pass to the framework');
    assert(drafts('    DATA(lo_prev) = client->get_app( client->get( )-s_draft-id_prev ).\n    DATA(lv_l) = |#{ lo_prev->id_app }|.').length === 0, 'what a call returns is not the id');
    assert(drafts('    DATA(lv_l) = |#{ client->get( )-s_draft-id_prev_app }|.').length === 0, 'id_prev_app');
    assert(drafts('    mv_text = `client->get( )-s_draft-id in a link: http://x#`.').length === 0, 'a plain literal is prose');
    assert(drafts('    DATA(lv_id) = client->get( )-s_draft-id.\n    DATA(lv_x) = lv_id.\n    DATA(lv_l) = |#{ lv_x }|.').length === 0, 'two levels of assignment are not followed');
    assert(drafts('    DATA lt_ids TYPE string_table.\n    INSERT client->get( )-s_draft-id INTO TABLE lt_ids.').length === 0, 'an internal table is no database');
    assert(drafts('    DATA lt_ids TYPE string_table.\n    DATA(lv_id) = client->get( )-s_draft-id.\n    MODIFY lt_ids FROM lv_id INDEX 1.').length === 0, 'MODIFY of a declared internal table');
    assert(drafts('    DATA(lv_l) = |#{ mv_text }|.\n  ENDMETHOD.\n  METHOD other.\n    DATA(lv_id) = client->get( )-s_draft-id.').length === 0, 'another method');
  });

  /* ── nonserializable-attribute ────────────────────────────────────── */
  const NOP = '    mv_text = `x`.';
  const helper = (name, head = '', intf = '') => `CLASS ${name} DEFINITION PUBLIC${head}.\n  PUBLIC SECTION.\n${intf}    DATA mv TYPE string.\nENDCLASS.\n\nCLASS ${name} IMPLEMENTATION.\nENDCLASS.\n`;
  const iface = (name, inner = '') => `INTERFACE ${name} PUBLIC.\n${inner}  DATA x TYPE string.\nENDINTERFACE.\n`;
  const judge = (decl, others = [], more = {}) => {
    const src = app(NOP, { decl, ...more });
    return of(src, 'nonserializable-attribute', { classIndex: classIndexOf([src, ...others]) });
  };

  section('nonserializable-attribute: the view builder and classes of the tree without the marker', () => {
    const vb = judge('    DATA mo_form TYPE REF TO z2ui5_cl_ui5_view_builder.\n');
    assert(vb.length === 1 && vb[0].member === 'mo_form' && vb[0].value === 'z2ui5_cl_ui5_view_builder', 'the view builder, from the fixed list');
    assert(/initial on the next roundtrip/.test(vb[0].message ?? ''), 'the message says what happens');
    assert(of(app(NOP, { decl: '  PROTECTED SECTION.\n    DATA mo_v TYPE REF TO z2ui5_cl_ui5_view_builder.\n' }), 'nonserializable-attribute').length === 1, 'any visibility, without a class index too');

    assert(judge('    DATA mo_log TYPE REF TO zcl_my_log.\n', [helper('zcl_my_log')]).length === 1, 'a class of the tree without if_serializable_object');
    assert(judge('    DATA mo_log TYPE REF TO zcl_my_log.\n', [helper('zcl_my_log', ' INHERITING FROM zcl_base'), helper('zcl_base')]).length === 1, 'a chain wholly in the tree');
    assert(judge('    DATA mo_log TYPE REF TO zcl_my_log.\n', [helper('zcl_my_log', '', '    INTERFACES zif_plain.\n'), iface('zif_plain')]).length === 1, 'an interface of the tree that does not include the marker');
    // an app inheriting z2ui5_if_app is judged too
    const sub = app(NOP, { decl: '    DATA mo_b TYPE REF TO z2ui5_cl_ui5_view_builder.\n', head: ' INHERITING FROM zcl_base_app', intf: false, name: 'zcl_sub' });
    const base = app(NOP, { name: 'zcl_base_app' });
    assert(of(sub, 'nonserializable-attribute', { classIndex: classIndexOf([sub, base]) }).length === 1, 'an app by inheritance');
  });

  section('nonserializable-attribute: what is not reported', () => {
    assert(judge('    DATA mo_s TYPE REF TO zcl_ser.\n', [helper('zcl_ser', '', '    INTERFACES if_serializable_object.\n')]).length === 0, 'a class with if_serializable_object');
    assert(judge('    DATA mo_s TYPE REF TO zcl_sub_ser.\n', [helper('zcl_sub_ser', ' INHERITING FROM zcl_ser'), helper('zcl_ser', '', '    INTERFACES if_serializable_object.\n')]).length === 0, 'a superclass with it');
    assert(judge('    DATA mo_s TYPE REF TO zcl_s.\n', [helper('zcl_s', '', '    INTERFACES: zif_a, zif_ser.\n'), iface('zif_a'), iface('zif_ser', '  INTERFACES if_serializable_object.\n')]).length === 0, 'an interface including it (chained INTERFACES)');
    assert(judge('    DATA mo_app TYPE REF TO zcl_other_app.\n', [app(NOP, { name: 'zcl_other_app' })]).length === 0, 'another app (z2ui5_if_app includes it)');
    assert(judge('    DATA mo_x TYPE REF TO zcl_x.\n', [helper('zcl_x', ' INHERITING FROM cl_unknown')]).length === 0, 'a superclass outside the tree');
    assert(judge('    DATA mo_x TYPE REF TO zcl_x.\n', [helper('zcl_x', '', '    INTERFACES if_oo_adt_classrun.\n')]).length === 0, 'an interface outside the tree');
    assert(judge('    DATA mo_alv TYPE REF TO cl_salv_table.\n').length === 0, 'a class the run does not hold');
    assert(judge('    DATA mi_in TYPE REF TO zif_plain.\n', [iface('zif_plain')]).length === 0, 'an interface');
    assert(judge('    DATA client TYPE REF TO z2ui5_if_client.\n    DATA mr TYPE REF TO data.\n    DATA mo TYPE REF TO object.\n').length === 0, 'client, data, object');
    assert(judge('    CLASS-DATA so_v TYPE REF TO z2ui5_cl_ui5_view_builder.\n').length === 0, 'CLASS-DATA');
    assert(judge('    DATA mo_v TYPE REF TO z2ui5_cl_ui5_view_builder.\n', [], { intf: false }).length === 0, 'a class that is no app');
    assert(judge('', [], { name: 'zcl_draft_app' }).length === 0 && of(app('    DATA lo_v TYPE REF TO z2ui5_cl_ui5_view_builder.'), 'nonserializable-attribute').length === 0, 'a local variable');
  });

  section('nonserializable-attribute: the cache key follows the referenced class', () => {
    const src = app(NOP, { decl: '    DATA mo_log TYPE REF TO zcl_my_log.\n' });
    const a = classIndexDeps(src, classIndexOf([src, helper('zcl_my_log')]));
    const b = classIndexDeps(src, classIndexOf([src, helper('zcl_my_log', '', '    INTERFACES if_serializable_object.\n')]));
    assert(a !== b, 'making the class serializable changes what --cache keys the app on');
  });
}
