/*
 * An app reaching past an API into what the framework keeps for itself.
 *
 * A downstream app repository, reviewed 2026-11: a method
 * delete_session_drafts deleted from z2ui5_t_01 (the drafts) directly, a
 * layout copy app read and wrote z2ui5_t_11 (layout-management's layouts),
 * and seven hand-written copies read the start parameter from
 * `url_param_get( s_config-search )`, else `t_comp_params`.
 *
 *   - framework-table-access reports Open SQL on a listed table, not inside
 *     the package that owns it, not a TYPE reference, not another
 *     z2ui5_t_* table;
 *   - start-param-by-hand reports a read of t_comp_params and a
 *     url_param_get( ) on s_config-search in an app class - not any other
 *     read of s_config, not a helper class.
 */
const cls = ({ name = 'zcl_app_x', intf = true, body = '' } = {}) =>
  `CLASS ${name} DEFINITION PUBLIC.\n\n  PUBLIC SECTION.\n`
  + (intf ? '    INTERFACES z2ui5_if_app.\n' : '    METHODS run IMPORTING client TYPE REF TO z2ui5_if_client.\n')
  + '    DATA name TYPE string.\n\nENDCLASS.\n\n\nCLASS ' + name + ' IMPLEMENTATION.\n\n'
  + `  METHOD ${intf ? 'z2ui5_if_app~main' : 'run'}.\n\n${body}\n  ENDMETHOD.\n\nENDCLASS.\n`;

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, properties: true, minUi5: '1.71' };
  const of = (src, type, extra = {}) => checkAbapSource(src, { ...opts, ...extra }).findings.filter((x) => x.type === type);

  section('framework-table-access: SQL on the drafts and the layouts is reported, per statement', () => {
    const src = cls({ body: [
      '    DELETE FROM z2ui5_t_01 WHERE uname = @sy-uname.',
      '    SELECT * FROM z2ui5_t_11 WHERE uname = @lv_from INTO TABLE @DATA(lt_layouts).',
      '    INSERT z2ui5_t_11 FROM TABLE @lt_layouts.',
      '    UPDATE z2ui5_t_01 SET timestampl = @lv_now WHERE id = @lv_id.',
      '    MODIFY z2ui5_t_11 FROM @ls_layout.',
      '    OPEN CURSOR @DATA(c) FOR SELECT id FROM z2ui5_t_01.',
      '    SELECT SINGLE id FROM zapp_head WHERE id IN ( SELECT id FROM z2ui5_t_01 ) INTO @DATA(lv_id2).',
    ].join('\n') });
    const ft = of(src, 'framework-table-access');
    assert(ft.length === 7, `seven accesses (${ft.length})`);
    assert(ft[0].value === 'z2ui5_t_01' && ft[0].member === 'DELETE', `DELETE on the drafts (${ft[0].member} ${ft[0].value})`);
    assert(ft[1].value === 'z2ui5_t_11' && ft[1].member === 'SELECT', 'SELECT on the layouts');
    assert(ft[5].member === 'OPEN CURSOR', `OPEN CURSOR (${ft[5].member})`);
    assert(ft[6].value === 'z2ui5_t_01', 'a subquery');
    assert(/z2ui5_cl_layo_manager/.test(ft[1].message ?? ''), 'the message names the layout API');
    assert(/draft_keep_per_chain/.test(ft[0].message ?? ''), 'the message names the exit settings');
    assert(ft.every((f) => (f.severity ?? 'warning') === 'warning'), 'a warning');
  });

  section('framework-table-access: what is not reported', () => {
    const quiet = (src, why, extra) => assert(of(src, 'framework-table-access', extra).length === 0, why);
    quiet(cls({ body: '    DATA ls_layout TYPE z2ui5_t_11.\n    DATA lt_drafts TYPE STANDARD TABLE OF z2ui5_t_01 WITH EMPTY KEY.' }), 'a TYPE reference is a structure, not an access');
    quiet(cls({ body: '    SELECT * FROM z2ui5_t_05 INTO TABLE @DATA(lt).\n    DELETE FROM z2ui5_t_99 WHERE id = @lv.' }), 'another z2ui5_t_* table is somebody else\'s');
    quiet(cls({ name: 'z2ui5_cl_ui5_srv_draft', intf: false, body: '    DELETE FROM z2ui5_t_01 WHERE id = @lv_id.' }), 'the framework on its own drafts', { allClasses: true });
    quiet(cls({ name: 'z2ui5_cl_layo_manager', intf: false, body: '    SELECT * FROM z2ui5_t_11 INTO TABLE @DATA(lt).' }), 'layout-management on its own layouts', { allClasses: true });
    quiet(cls({ body: '    SELECT * FROM z2ui5_t_11 INTO TABLE @DATA(lt).' }), 'a repository that defines the table', { ownObjects: ['z2ui5_t_11'] });
    quiet(cls({ body: '    DATA(lt_heads) = z2ui5_cl_layo_manager=>select_layouts_by_range( ir_uname = lr_uname ).' }), 'the API');
    quiet(cls({ body: '    lv = `DELETE FROM z2ui5_t_01`.\n    " SELECT * FROM z2ui5_t_11' }), 'a literal and a comment');
    // the owner of one table is not the owner of the other
    assert(of(cls({ name: 'z2ui5_cl_layo_manager', intf: false, body: '    DELETE FROM z2ui5_t_01 WHERE uname = @sy-uname.' }), 'framework-table-access', { allClasses: true }).length === 1,
      'layout-management on the drafts is reported');
  });

  section('start-param-by-hand: t_comp_params and url_param_get( ) on s_config-search are reported', () => {
    const src = cls({ body: [
      '    DATA(lv_lgn) = z2ui5_cl_util=>url_param_get( val = `lgn` url = client->get( )-s_config-search ).',
      '    IF lv_lgn IS INITIAL.',
      '      lv_lgn = VALUE #( client->get( )-t_comp_params[ n = `LGN` ]-v OPTIONAL ).',
      '    ENDIF.',
      '    READ TABLE client->get( )-t_comp_params INTO DATA(ls_param) WITH KEY n = `LGN`.',
    ].join('\n') });
    const sp = of(src, 'start-param-by-hand');
    assert(sp.length === 3, `three reads (${sp.length})`);
    assert(sp.filter((f) => f.member === 't_comp_params').length === 2, 'the table expression and the READ TABLE');
    assert(sp.some((f) => f.member === 'url_param_get'), 'the url_param_get( )');
    assert(sp.every((f) => (f.severity ?? 'hint') === 'hint'), 'a hint');
    assert(sp.every((f) => /get_start_param/.test(f.message ?? '')), 'the message names get_start_param( )');
  });

  section('start-param-by-hand: through a variable, in any case', () => {
    const src = cls({ body: [
      '    DATA(ls_get) = CLIENT->GET( ).',
      '    LOOP AT ls_get-T_COMP_PARAMS INTO DATA(ls_p).',
      '    ENDLOOP.',
      '    DATA(lv_search) = ls_get-s_config-search.',
      '    DATA(lv_lgn) = lcl_util=>URL_PARAM_GET( val = `lgn` url = lv_search ).',
      '    DATA(lt_all) = z2ui5_cl_util=>url_param_get_tab( client->get( )-s_config-search ).',
    ].join('\n') });
    const sp = of(src, 'start-param-by-hand');
    assert(sp.length === 3, `LOOP AT a copy, url_param_get( ) on a copy of search, url_param_get_tab( ) (${sp.length})`);
  });

  section('start-param-by-hand: what is not reported', () => {
    const quiet = (src, why, extra) => assert(of(src, 'start-param-by-hand', extra).length === 0, why);
    quiet(cls({ body: '    DATA(lv_lgn) = client->get_start_param( `lgn` ).' }), 'get_start_param( )');
    quiet(cls({ body: [
      '    DATA(lv_origin) = client->get( )-s_config-origin.',
      '    DATA(lv_hash) = client->get( )-s_config-hash.',
      '    IF client->get( )-s_config-search CS `debug=X`.',
      '    ENDIF.',
      '    DATA(lv_s) = client->get( )-s_config-search.',
      '    DATA(lv_route) = url_param_get( val = `route` url = lv_hash ).',
    ].join('\n') }), 's_config-search and s_config-hash read for anything else');
    quiet(cls({ body: '    DATA(lv_x) = z2ui5_cl_util=>url_param_get( val = `x` url = lv_url ).' }), 'url_param_get( ) on another URL');
    quiet(cls({ intf: false, body: '    DATA(lv) = VALUE string( client->get( )-t_comp_params[ n = `LGN` ]-v OPTIONAL ).' }), 'a class that is not an app', { allClasses: true });
    quiet(cls({ body: '    lv = `client->get( )-t_comp_params`.\n    " url_param_get( url = client->get( )-s_config-search )' }), 'a literal and a comment');
  });
}
