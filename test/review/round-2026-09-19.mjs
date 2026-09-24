/*
 * The 2026-09-19 round: the abap2UI5-specific rules and fixes that came out
 * of the "pure ABAP goes to abaplint" split. Four rules (handler-without-event,
 * binding-to-expression, association-unknown-id, column-cell-count-mismatch;
 * a fifth, obsolete-event-constant, was withdrawn before release when
 * abap2UI5 removed every constant it judged), six new fixes on rules that had none, and the
 * did-you-mean batch on the closed sets that had no caseMatch yet. See
 * test/review/README.md for the harness.
 */
import { applyFixes } from '../../lib/fix.mjs';

const frame = ({ defs = '', main = '', attrs = '', chain = '', methods = '', prot = '  PROTECTED SECTION.\n', priv = '  PRIVATE SECTION.\n' } = {}) =>
  'CLASS zcl_review_round0919 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
  + defs + prot + priv + 'ENDCLASS.\n\n'
  + 'CLASS zcl_review_round0919 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + main
  + '\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`     v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + '        )->ele( `Page`\n'
  + '          )->a( n = `id` v = `mainPage`\n'
  + '          )->tag( `Button`\n'
  + '            )->a( n = `text` v = client->_bind( mv_text )\n'
  + attrs
  + chain
  + '        )->end( ).\n\n'
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\n'
  + methods
  + 'ENDCLASS.\n';

/* A dispatcher-only main( ): the view is built in render( ), so the display
 * is gated by the lifecycle branches and nothing else. */
const dispatcher = (main, { defs = '', methods = '' } = {}) =>
  'CLASS zcl_review_dispatch0919 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n    METHODS render RETURNING VALUE(result) TYPE string.\n'
  + defs + 'ENDCLASS.\n\nCLASS zcl_review_dispatch0919 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n' + main + '  ENDMETHOD.\n\n'
  + '  METHOD render.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` )->tag( `Button` )->a( n = `text` v = client->_bind( mv_text ) )->end( ).\n'
  + '    result = view->stringify( ).\n  ENDMETHOD.\n' + methods + 'ENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, properties: true, minUi5: '1.120' };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const fixed = (src, type) => applyFixes(src, of(src, type)).output;

  section('round 2026-09-19: the frames are clean', () => {
    const a = judge(frame()).map((x) => x.type);
    const b = judge(dispatcher('    IF client->check_on_init( ).\n      mv_text = `init`.\n      client->view_display( render( ) ).\n    ELSEIF client->check_on_navigated( ).\n      client->view_display( render( ) ).\n    ENDIF.\n')).map((x) => x.type);
    assert(a.length === 0 && b.length === 0, `both frames report nothing on their own (${[...a, ...b].join(', ') || 'none'})`);
  });

  // ---------------------------------------------------------------- rules

  section('handler-without-event: a WHEN nothing raises, and the three silences', () => {
    const src = frame({
      attrs: '            )->a( n = `press` v = client->_event( `SAVE` )\n',
      main: '    CASE client->get_event( ).\n      WHEN `SAVE_`.\n        mv_text = `x`.\n      WHEN `SAVE`.\n        mv_text = `y`.\n    ENDCASE.\n',
    });
    const hits = of(src, 'handler-without-event');
    assert(hits.length === 1 && hits[0].value === 'SAVE_' && hits[0].severity === 'hint', `the SAVE_ handler is reported as a hint (${hits.map((h) => h.value).join(', ')})`);
    assert(hits[0].line === 14 && src.split('\n')[13].includes('WHEN `SAVE_`'), `it sits on the WHEN line (${hits[0].line})`);
    const dynamic = frame({ attrs: '            )->a( n = `press` v = client->_event( mv_text )\n', main: '    CASE client->get_event( ).\n      WHEN `SAVE_`.\n        mv_text = `x`.\n    ENDCASE.\n' });
    assert(of(dynamic, 'handler-without-event').length === 0, 'a raise that is not a literal voids the judgement');
    const handed = frame({ attrs: '            )->a( n = `press` v = client->_event( `SAVE` )\n', main: '    zcl_helper=>render( client ).\n    CASE client->get_event( ).\n      WHEN `SAVE_`.\n        mv_text = `x`.\n    ENDCASE.\n' });
    assert(of(handed, 'handler-without-event').length === 0, 'a class handing its client to another object is not judged');
    const noRaise = frame({ main: '    CASE client->get_event( ).\n      WHEN `SAVE_`.\n        mv_text = `x`.\n    ENDCASE.\n' });
    assert(of(noRaise, 'handler-without-event').length === 0, 'a class raising nothing itself is not judged');
    const cased = frame({ attrs: '            )->a( n = `press` v = client->_event( `save` )\n', main: '    CASE client->get_event( ).\n      WHEN `SAVE`.\n        mv_text = `x`.\n    ENDCASE.\n' });
    assert(of(cased, 'handler-without-event').length === 0 && of(cased, 'event-name-case-mismatch').length === 1, 'a case-different raise is the case-mismatch rule\'s finding, not this one\'s');
  });

  section('binding-to-expression: a call, a constructor, a literal; an attribute and a table expression stay', () => {
    const src = frame({
      attrs: '            )->a( n = `tooltip` v = client->_bind( get_tip( ) )\n'
        + '            )->a( n = `enabled` v = client->_bind( val = VALUE #( ) )\n'
        + '            )->a( n = `icon` v = client->_bind( `sap-icon://save` )\n'
        + '            )->a( n = `visible` v = client->_bind( me->mv_text )\n',
    });
    const hits = of(src, 'binding-to-expression');
    assert(hits.length === 3 && hits.every((h) => h.severity === 'error'), `three errors (${hits.length})`);
    assert(hits.map((h) => h.member).join(',') === 'call,constructor,literal', `each names its kind (${hits.map((h) => h.member).join(',')})`);
    const fine = frame({ defs: '    DATA mt_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.\n    DATA mr_ref TYPE REF TO data.\n', attrs: '            )->a( n = `tooltip` v = client->_bind( mt_rows[ 1 ] )\n            )->a( n = `icon` v = client->_bind( mr_ref->* )\n' });
    assert(of(fine, 'binding-to-expression').length === 0, 'a table expression and a dereference are not expressions here');
  });

  section('association-unknown-id: a labelFor no id answers to, a case miss with a fix, a bound id voids the set', () => {
    const src = frame({ chain: '            )->tag( `Label` )->a( n = `text` v = `Name` )->a( n = `labelFor` v = `nameInput`\n            )->tag( `Input` )->a( n = `id` v = `name_input`\n' });
    const hits = of(src, 'association-unknown-id');
    assert(hits.length === 1 && hits[0].value === 'nameInput' && hits[0].severity === 'warning', `one warning on nameInput (${hits.length})`);
    assert(hits[0].allowed.includes('name_input') && hits[0].allowed.includes('mainPage'), 'the message lists the document\'s ids');
    const cased = frame({ chain: '            )->tag( `Label` )->a( n = `text` v = `Name` )->a( n = `labelFor` v = `nameinput`\n            )->tag( `Input` )->a( n = `id` v = `nameInput`\n' });
    const c = of(cased, 'association-unknown-id');
    assert(c.length === 1 && c[0].suggestion === 'nameInput' && c[0].fixes?.length === 1, 'a case miss carries the suggestion and a fix');
    assert(/labelFor` v = `nameInput`/.test(fixed(cased, 'association-unknown-id')), 'the fix rewrites the id');
    const bound = frame({ chain: '            )->tag( `Label` )->a( n = `labelFor` v = `nameInput`\n            )->tag( `Input` )->a( n = `id` v = `{/MV_TEXT}`\n' });
    assert(of(bound, 'association-unknown-id').length === 0, 'a bound id anywhere in the document voids the judgement');
    const multi = frame({ chain: '            )->tag( `Input` )->a( n = `id` v = `a1` )->a( n = `ariaLabelledBy` v = `mainPage a1 $event`\n' });
    assert(of(multi, 'association-unknown-id').length === 0, 'a multiple association is judged id by id, and a $ value is client-side');
  });

  section('column-cell-count-mismatch: one cell for two columns, and the bound shapes stay silent', () => {
    const table = (cells) => frame({
      chain: '            )->ele( `Table`\n              )->ele( `columns`\n                )->tag( `Column` )->tag( `Column`\n              )->end(\n              )->ele( `items`\n                )->ele( `ColumnListItem`\n                  )->ele( `cells`\n' + cells + '                  )->end(\n                )->end(\n              )->end(\n            )->end(\n',
    });
    const hits = of(table('                    )->tag( `Text` )->a( n = `text` v = `a`\n'), 'column-cell-count-mismatch');
    assert(hits.length === 1 && hits[0].count === 1 && hits[0].expected === 2 && hits[0].severity === 'warning', `one warning, 1 cell for 2 columns (${hits.length})`);
    assert(of(table('                    )->tag( `Text` )->a( n = `text` v = `a`\n                    )->tag( `Text` )->a( n = `text` v = `b`\n'), 'column-cell-count-mismatch').length === 0, 'two cells for two columns is fine');
    const bound = frame({ defs: '    DATA mt_cols TYPE STANDARD TABLE OF string WITH EMPTY KEY.\n', chain: '            )->ele( `Table` )->a( n = `columns` v = client->_bind( mt_cols )\n              )->ele( `items`\n                )->ele( `ColumnListItem`\n                  )->ele( `cells`\n                    )->tag( `Text` )->a( n = `text` v = `a`\n                  )->end(\n                )->end(\n              )->end(\n            )->end(\n' });
    assert(of(bound, 'column-cell-count-mismatch').length === 0, 'bound columns are a runtime shape and not judged');
  });

  // ---------------------------------------------------------------- fixes

  section('did-you-mean batch: a case miss on every closed set carries a fix', () => {
    const cases = [
      ['unknown-frontend-action', frame({ main: '    client->follow_up_action( val = `set_title` t_arg = VALUE #( ( `Hi` ) ) ).\n' }), 'val = `SET_TITLE`'],
      // the two below carry the fix without advertising it on the page: their
      // card examples (NESTED, a wrong global target) are not case misses
      ['unknown-view-slot', frame({ main: '    client->follow_up_action( val = client->cs_event-control_by_id view = `main` t_arg = VALUE #( ( `mainPage` ) ( `setTitle` ) ( `x` ) ) ).\n' }), 'view = `MAIN`'],
      ['unknown-model', frame({ attrs: '            )->a( n = `visible` v = `{Device>/system/phone}`\n' }), '`{device>/system/phone}`'],
      ['uncurated-formatter', frame({ attrs: "            )->a( n = `tooltip` v = |\\{ path: '{ client->_bind( val = mv_text path = abap_true ) }', formatter: 'Formatter.datecreateobject' \\}|\n" }), "'Formatter.DateCreateObject'"],
      ['invalid-frontend-action', frame({ main: '    client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `mainPage` ) ( `items` ) ( `filter` ) ( `[[["TEXT","contains","x"]]]` ) ) ).\n' }), '"Contains"'],
    ];
    for (const [type, src, expect] of cases) {
      const hits = of(src, type);
      assert(hits.length === 1 && hits[0].suggestion && hits[0].fixes?.length === 1, `${type}: one finding with a suggestion and a fix (${hits.length}, ${hits[0]?.suggestion})`);
      assert(/did you mean/.test(hits[0].message), `${type}: the message says so`);
      const out = fixed(src, type);
      assert(out.includes(expect) && of(out, type).length === 0, `${type}: the fix writes ${expect} and the finding is gone`);
    }
    const foreign = frame({ attrs: '            )->a( n = `visible` v = `{i18n>title}`\n' });
    const f = of(foreign, 'unknown-model');
    assert(f.length === 1 && !f[0].fixes, 'a model that is really absent carries no fix');
  });

  section('missing-on-navigated-branch fix: the two lines before the branch end, in both dispatcher shapes', () => {
    const two = dispatcher('    IF client->check_on_init( ).\n      mv_text = `init`.\n      client->view_display( render( ) ).\n    ELSEIF client->check_on_event( `GO` ).\n      mv_text = `go`.\n    ENDIF.\n');
    const hits = of(two, 'missing-on-navigated-branch');
    assert(hits.length === 1 && hits[0].fixes?.length === 1, 'the two-branch dispatcher carries a fix');
    const out = fixed(two, 'missing-on-navigated-branch');
    assert(out.includes('      client->view_display( render( ) ).\n    ELSEIF client->check_on_navigated( ).\n      client->view_display( render( ) ).\n    ELSEIF client->check_on_event( `GO` ).'), 'the branch is written between init and the event branch, at the init branch\'s indentation');
    assert(of(out, 'missing-on-navigated-branch').length === 0 && judge(out).length === 0, 'the fixed class is clean');
    const helper = dispatcher('    IF client->check_on_init( ).\n      show( ).\n    ENDIF.\n', { defs: '    METHODS show.\n', methods: '  METHOD show.\n    client->view_display( render( ) ).\n  ENDMETHOD.\n' });
    const h = fixed(helper, 'missing-on-navigated-branch');
    assert(h.includes('      show( ).\n    ELSEIF client->check_on_navigated( ).\n      show( ).\n    ENDIF.'), 'a display through a helper is copied as the helper call');
    const twoDisplays = dispatcher('    IF client->check_on_init( ).\n      client->view_display( render( ) ).\n      client->popup_display( render( ) ).\n    ENDIF.\n');
    const t = of(twoDisplays, 'missing-on-navigated-branch');
    assert(t.length === 1 && !t[0].fixes, 'two displays in the init branch: reported, no fix');
  });

  section('separate-lifecycle-ifs fix: adjacent blocks fold into one chain, an ELSE keeps the finding', () => {
    const src = frame({ main: '    IF client->check_on_init( ).\n      mv_text = `init`.\n    ENDIF.\n    IF client->check_on_navigated( ).\n      mv_text = `nav`.\n    ENDIF.\n    IF client->check_on_event( `GO` ).\n      mv_text = `go`.\n    ENDIF.\n' });
    const hits = of(src, 'separate-lifecycle-ifs');
    assert(hits.length === 1 && hits[0].fixes?.length === 2, `one finding, two folds (${hits[0]?.fixes?.length})`);
    const out = fixed(src, 'separate-lifecycle-ifs');
    assert(out.includes('      mv_text = `init`.\n    ELSEIF client->check_on_navigated( ).\n      mv_text = `nav`.\n    ELSEIF client->check_on_event( `GO` ).\n      mv_text = `go`.\n    ENDIF.'), 'one IF/ELSEIF chain');
    assert(of(out, 'separate-lifecycle-ifs').length === 0, 'and the finding is gone');
    const withElse = frame({ main: '    IF client->check_on_init( ).\n      mv_text = `init`.\n    ELSE.\n      mv_text = `x`.\n    ENDIF.\n    IF client->check_on_navigated( ).\n      mv_text = `nav`.\n    ENDIF.\n' });
    const e = of(withElse, 'separate-lifecycle-ifs');
    assert(e.length === 1 && !e[0].fixes, 'a first block with an ELSE cannot take an ELSEIF: no fix');
    const apart = frame({ main: '    IF client->check_on_init( ).\n      mv_text = `init`.\n    ENDIF.\n    mv_text = `between`.\n    IF client->check_on_navigated( ).\n      mv_text = `nav`.\n    ENDIF.\n' });
    const a = of(apart, 'separate-lifecycle-ifs');
    assert(a.length === 1 && !a[0].fixes, 'a statement between the blocks: no fix');
  });

  section('binding-to-nonpublic fix: the declaration moves into the PUBLIC SECTION, comment and all', () => {
    const src = frame({ prot: '  PROTECTED SECTION.\n    DATA mv_hidden TYPE string.   " state\n    DATA mv_other TYPE i.\n', attrs: '            )->a( n = `tooltip` v = client->_bind( mv_hidden )\n' });
    const hits = of(src, 'binding-to-nonpublic');
    assert(hits.length === 1 && hits[0].fixes?.length === 2, 'one finding, a delete and an insert');
    const out = fixed(src, 'binding-to-nonpublic');
    assert(out.includes('    DATA mv_text TYPE string.\n    DATA mv_hidden TYPE string.   " state\n  PROTECTED SECTION.\n    DATA mv_other TYPE i.\n  PRIVATE SECTION.'), 'moved to the end of the PUBLIC SECTION, the neighbour untouched');
    assert(of(out, 'binding-to-nonpublic').length === 0, 'and the finding is gone');
    const chained = frame({ prot: '  PROTECTED SECTION.\n    DATA: mv_hidden TYPE string,\n          mv_other TYPE i.\n', attrs: '            )->a( n = `tooltip` v = client->_bind( mv_hidden )\n' });
    const c = of(chained, 'binding-to-nonpublic');
    assert(c.length === 1 && !c[0].fixes, 'a chained declaration is reported without a fix');
  });

  section('private-app-attribute fix: a rename where no PROTECTED SECTION exists, a move where one does', () => {
    const rename = frame({ prot: '', priv: '  PRIVATE SECTION.\n    DATA mv_p TYPE string.\n    DATA mv_q TYPE i.\n' });
    const r = of(rename, 'private-app-attribute');
    assert(r.length === 2 && r[0].fixes?.length === 1 && !r[1].fixes, 'two findings, the rename on the first only');
    const out = fixed(rename, 'private-app-attribute');
    assert(out.includes('  PROTECTED SECTION.\n    DATA mv_p TYPE string.\n    DATA mv_q TYPE i.\nENDCLASS.') && !/PRIVATE SECTION/.test(out), 'the section is renamed');
    assert(of(out, 'private-app-attribute').length === 0, 'and both findings are gone');
    const move = frame({ prot: '  PROTECTED SECTION.\n    DATA mv_prot TYPE i.\n', priv: '  PRIVATE SECTION.\n    DATA mv_p TYPE string.\n    DATA mv_q TYPE i.\n' });
    const m = of(move, 'private-app-attribute');
    assert(m.length === 2 && m.every((x) => x.fixes?.length === 2), 'two findings, each a delete and an insert');
    const moved = fixed(move, 'private-app-attribute');
    assert(moved.includes('  PROTECTED SECTION.\n    DATA mv_prot TYPE i.\n    DATA mv_p TYPE string.\n    DATA mv_q TYPE i.\n  PRIVATE SECTION.\nENDCLASS.'), 'both moved behind the protected declaration, in order');
    assert(of(moved, 'private-app-attribute').length === 0, 'and the findings are gone');
  });

  section('hardcoded-binding-path fix: the whole-literal {/NAME} of a public attribute becomes a _bind( )', () => {
    const src = frame({ attrs: '            )->a( n = `tooltip` v = `{/MV_TEXT}`\n            )->a( n = `icon` v = `{/MV_TEXT} x`\n            )->a( n = `enabled` v = `{/NOWHERE}`\n' });
    const hits = of(src, 'hardcoded-binding-path');
    assert(hits.length === 3 && hits[0].fixes?.length === 1 && !hits[1].fixes && !hits[2].fixes, `three findings, only the whole-literal public one fixable (${hits.map((h) => Boolean(h.fixes)).join(',')})`);
    const out = fixed(src, 'hardcoded-binding-path');
    assert(out.includes(')->a( n = `tooltip` v = client->_bind( mv_text )'), 'rewritten to the derived form');
    assert(of(out, 'hardcoded-binding-path').length === 2, 'the other two stay');
  });

  section('external-link-without-target fix: a target call behind the href, in both layouts', () => {
    const house = frame({ chain: '          )->tag( `Link`\n            )->a( n = `text` v = `Docs`\n            )->a( n = `href` v = `https://sdk.openui5.org/`\n' });
    const h = of(house, 'external-link-without-target');
    assert(h.length === 1 && h[0].fixes?.length === 1, 'the house layout carries a fix');
    const out = fixed(house, 'external-link-without-target');
    assert(out.includes('            )->a( n = `href` v = `https://sdk.openui5.org/`\n            )->a( n = `target` v = `_blank`\n        )->end( ).'), 'the target call takes a line of its own, closed by the paren that closed the href');
    assert(of(out, 'external-link-without-target').length === 0 && judge(out).length === 0, 'the fixed class is clean');
    const compact = frame({ chain: '            )->tag( `Link` )->a( n = `text` v = `Docs` )->a( n = `href` v = `https://sdk.openui5.org/` )->a( n = `tooltip` v = `x`\n' });
    const c = fixed(compact, 'external-link-without-target');
    assert(c.includes('->a( n = `href` v = `https://sdk.openui5.org/` )->a( n = `target` v = `_blank` )'), 'the compact layout appends the call');
    const header = frame({ chain: '            )->tag( `ObjectHeader` )->a( n = `title` v = `x` )->a( n = `titleHref` v = `https://sdk.openui5.org/` )->a( n = `tooltip` v = `x`\n' });
    const o = fixed(header, 'external-link-without-target');
    assert(o.includes('->a( n = `titleTarget` v = `_blank` )'), 'the ObjectHeader pair writes its own target attribute');
  });

  // ---------------------------------------------------------------- second batch: rules

  section('loop-work-area-bound: the three work-area shapes, the fix on ASSIGNING, silence with tab =', () => {
    const loop = (header, bind) => dispatcher('    IF client->check_on_init( ).\n      mv_text = `x`.\n      client->view_display( render( ) ).\n    ELSEIF client->check_on_navigated( ).\n      client->view_display( render( ) ).\n    ENDIF.\n', {
      defs: '    TYPES: BEGIN OF ty_row, name TYPE string, END OF ty_row.\n    DATA mt_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n    DATA ms_row TYPE ty_row.\n',
    }).replace('    result = view->stringify', `    ${header}\n      view->tag( \`Input\` )->a( n = \`value\` v = client->_bind( ${bind} ) ).\n    ENDLOOP.\n    result = view->stringify`);
    const fs = loop('LOOP AT mt_rows ASSIGNING FIELD-SYMBOL(<row>).', '<row>-name');
    const a = of(fs, 'loop-work-area-bound');
    assert(a.length === 1 && a[0].member === 'field symbol' && a[0].control === 'mt_rows' && a[0].fixes?.length === 1, `the ASSIGNING shape is reported with a fix (${a.length}, ${a[0]?.member})`);
    const out = fixed(fs, 'loop-work-area-bound');
    assert(out.includes('client->_bind( val = <row>-name tab = mt_rows tab_index = sy-tabix )'), 'the fix writes the cell binding');
    assert(of(out, 'loop-work-area-bound').length === 0, 'and the finding is gone');
    const attr = of(loop('LOOP AT mt_rows INTO ms_row.', 'ms_row-name'), 'loop-work-area-bound');
    assert(attr.length === 1 && attr[0].member === 'attribute' && !attr[0].fixes, 'an attribute work area is reported without a fix');
    const local = of(loop('LOOP AT mt_rows INTO DATA(row).', 'row-name'), 'loop-work-area-bound');
    assert(local.length === 1 && local[0].member === 'local' && !local[0].fixes, 'a local work area is reported without a fix');
    const clobbered = loop('LOOP AT mt_rows ASSIGNING FIELD-SYMBOL(<row>).\n      READ TABLE mt_rows INDEX 1 TRANSPORTING NO FIELDS.', '<row>-name');
    const c = of(clobbered, 'loop-work-area-bound');
    assert(c.length === 1 && !c[0].fixes, 'a READ TABLE before the bind has moved sy-tabix: no fix');
    assert(of(loop('LOOP AT mt_rows ASSIGNING FIELD-SYMBOL(<row>).', 'val = <row>-name tab = mt_rows tab_index = sy-tabix'), 'loop-work-area-bound').length === 0, 'the cell binding is the remedy and is not reported');
  });

  section('bound-aggregation-without-template: a bound items with no child, and the two template shapes', () => {
    const list = (chain) => frame({ defs: '    DATA mt_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.\n', chain });
    const bare = list('          )->ele( `List` )->a( n = `items` v = client->_bind( mt_rows )\n          )->end(\n');
    const hits = of(bare, 'bound-aggregation-without-template');
    assert(hits.length === 1 && hits[0].member === 'items' && hits[0].severity === 'error', `one error on items (${hits.length})`);
    assert(of(list('          )->ele( `List` )->a( n = `items` v = client->_bind( mt_rows )\n            )->tag( `StandardListItem` )->a( n = `title` v = `{TEXT}`\n          )->end(\n'), 'bound-aggregation-without-template').length === 0, 'a template under the default aggregation is fine');
    assert(of(list('          )->ele( `List` )->a( n = `items` v = client->_bind( mt_rows )\n            )->ele( `items` )->tag( `StandardListItem` )->a( n = `title` v = `{TEXT}`\n            )->end(\n          )->end(\n'), 'bound-aggregation-without-template').length === 0, 'a template under the explicit aggregation tag is fine');
  });

  section('bound-aggregation-without-template: sap.ui.table rows bind without a template', () => {
    /* sap.ui.table.Table sets _doesNotRequireFactory on `rows`: the cells
     * come from each column's template, and a row template is not even
     * supported. Reported on four samples-controls ports (115, 137, 164,
     * 174) that load and render fine. */
    const table = (tag) => frame({ defs: '    DATA mt_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.\n', chain:
      `          )->ele( n = \`${tag}\` ns = \`table\` )->a( n = \`xmlns:table\` v = \`sap.ui.table\` )->a( n = \`rows\` v = client->_bind( mt_rows )\n`
      + '            )->ele( n = `columns` ns = `table` )->ele( n = `Column` ns = `table` )->ele( n = `template` ns = `table` )->tag( `Text` )->a( n = `text` v = `{TEXT}`\n'
      + '            )->end( )->end( )->end(\n          )->end(\n' });
    for (const tag of ['Table', 'TreeTable', 'AnalyticalTable']) {
      const src = table(tag);
      assert(of(src, 'bound-aggregation-without-template').length === 0, `sap.ui.table.${tag} rows with column templates is not reported`);
      assert(of(src, 'unknown-control').length === 0 && of(src, 'unknown-aggregation').length === 0, `the fixture really is a sap.ui.table.${tag} (no unknown control or aggregation)`);
    }
    const list = frame({ defs: '    DATA mt_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.\n', chain: '          )->ele( `List` )->a( n = `items` v = client->_bind( mt_rows )\n          )->end(\n' });
    assert(of(list, 'bound-aggregation-without-template').length === 1, 'the exemption is per aggregation: a bare List items is still reported');
  });

  section('unknown-source-property: a $source path the control does not have, with the did-you-mean', () => {
    const src = frame({ chain: '            )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( `${$source>/txt}` ) ( `${$source>/Text}` ) ( `${$source>/text}` ) ) )\n', main: '    IF client->check_on_event( `GO` ).\n      mv_text = client->get_event_arg( ).\n    ENDIF.\n' });
    const hits = of(src, 'unknown-source-property');
    assert(hits.length === 2 && hits.every((h) => h.severity === 'hint'), `two hints (${hits.length})`);
    const cased = hits.find((h) => h.member === 'Text');
    assert(cased?.suggestion === 'text' && cased.fixes?.length === 1, 'the case miss carries the suggestion and a fix');
    assert(!hits.find((h) => h.member === 'txt')?.fixes, 'the typo carries none');
  });

  section('editable-control-without-binding: an unbound Input, a bound one, a wired one, a read-only one', () => {
    const one = (attrs) => frame({ chain: `          )->tag( \`Input\` )${attrs}\n` });
    assert(of(one('->a( n = `placeholder` v = `type` )'), 'editable-control-without-binding').length === 1, 'an Input with a placeholder and nothing else is reported');
    assert(of(one('->a( n = `value` v = client->_bind( mv_text ) )'), 'editable-control-without-binding').length === 0, 'a bound value is not');
    assert(of(one('->a( n = `change` v = client->_event( `GO` ) )'), 'editable-control-without-binding').length === 0, 'a wired event is not');
    assert(of(one('->a( n = `value` v = `fixed` )->a( n = `editable` v = `false` )'), 'editable-control-without-binding').length === 0, 'a read-only control is not an input');
    const check = frame({ chain: '          )->tag( `CheckBox` )->a( n = `text` v = `ok`\n          )->tag( `Text` )->a( n = `text` v = `plain`\n' });
    const c = of(check, 'editable-control-without-binding');
    assert(c.length === 1 && c[0].member === 'selected' && c[0].control === 'sap.m.CheckBox', 'a CheckBox is judged on selected, a Text not at all');
  });

  // ---------------------------------------------------------------- second batch: fixes

  section('client-handle-capture fix: the call is inlined at its one read, twice read keeps the finding', () => {
    const cap = (extra = '') => dispatcher('    IF client->check_on_init( ).\n      mv_text = `x`.\n      client->view_display( render( ) ).\n    ELSEIF client->check_on_navigated( ).\n      client->view_display( render( ) ).\n    ENDIF.\n')
      .replace('    view->ele( n = `View`', `    DATA(lv_value) = client->_bind( mv_text ).\n${extra}    view->ele( n = \`View\``)
      .replace('v = client->_bind( mv_text ) )->end( ).', 'v = lv_value )->end( ).');
    const src = cap();
    const hits = of(src, 'client-handle-capture');
    assert(hits.length === 1 && hits[0].fixes?.length === 2, 'one finding, a delete and an inline');
    const out = fixed(src, 'client-handle-capture');
    assert(!/lv_value/.test(out) && out.includes('v = client->_bind( mv_text ) )->end( ).'), 'the call stands where the name was, the capture is gone');
    assert(of(out, 'client-handle-capture').length === 0, 'and the finding is gone');
    const twice = of(cap('    mv_text = lv_value.\n'), 'client-handle-capture');
    assert(twice.length === 1 && !twice[0].fixes, 'a name read twice keeps the finding without a fix');
  });

  section('missing-view-display-on-navigated fix: the init branch\'s display is copied into the branch', () => {
    const src = dispatcher('    IF client->check_on_init( ).\n      mv_text = `x`.\n      client->view_display( render( ) ).\n    ELSEIF client->check_on_navigated( ).\n      mv_text = `back`.\n    ENDIF.\n');
    const hits = of(src, 'missing-view-display-on-navigated');
    assert(hits.length === 1 && hits[0].fixes?.length === 1, 'the branch carries a fix');
    const out = fixed(src, 'missing-view-display-on-navigated');
    assert(out.includes('      mv_text = `back`.\n      client->view_display( render( ) ).\n    ENDIF.'), 'written as the branch\'s last statement');
    assert(judge(out).length === 0, 'the fixed class is clean');
    const two = dispatcher('    IF client->check_on_init( ).\n      client->view_display( render( ) ).\n      client->popup_display( render( ) ).\n    ELSEIF client->check_on_navigated( ).\n      mv_text = `back`.\n    ENDIF.\n');
    const t = of(two, 'missing-view-display-on-navigated');
    assert(t.length === 1 && !t[0].fixes, 'two displays in the init branch: reported, no fix');
  });

  section('unknown-binding-path fix: a case miss on a field is rewritten, a missing field keeps the finding', () => {
    const src = frame({ attrs: '            )->a( n = `tooltip` v = `{/mv_text}`\n            )->a( n = `icon` v = `{/NOPE}`\n' });
    const hits = of(src, 'unknown-binding-path');
    assert(hits.length === 2 && hits[0].suggestion === 'MV_TEXT' && hits[0].fixes?.length === 1 && !hits[1].fixes && !('keys' in hits[0]), 'the case miss carries the pair, the finding no key list');
    const out = fixed(src, 'unknown-binding-path');
    assert(out.includes('v = `{/MV_TEXT}`') && of(out, 'unknown-binding-path').length === 1, 'rewritten; the real miss stays');
  });

  section('excess-shut fix: the end( ) past the root is deleted', () => {
    const src = frame({ chain: '        )->end(\n        )->end(\n' });
    const hits = of(src, 'excess-shut');
    assert(hits.length === 1 && hits[0].fixes?.length === 1, 'one finding with a fix');
    const out = fixed(src, 'excess-shut');
    assert(out.includes('        )->end(\n        )->end(\n        ).') && of(out, 'excess-shut').length === 0, 'the last end( ) is gone, the paren stays');
  });

  section('insecure-asset-url fix: a loaded uri goes https, a hyperlink keeps its hint', () => {
    const src = frame({ chain: '          )->tag( `Image` )->a( n = `src` v = `http://x.org/a.png`\n          )->tag( `Link` )->a( n = `href` v = `http://x.org/` )->a( n = `target` v = `_blank`\n' });
    const hits = of(src, 'insecure-asset-url');
    assert(hits.length === 2, `two findings (${hits.length})`);
    const img = hits.find((h) => h.member === 'src');
    const link = hits.find((h) => h.member === 'href');
    assert(img?.fixes?.length === 1 && img.severity === 'error' && !link?.fixes && link?.severity === 'hint', 'the image carries the fix, the link does not');
    const out = fixed(src, 'insecure-asset-url');
    assert(out.includes('v = `https://x.org/a.png`') && out.includes('v = `http://x.org/`'), 'only the image is rewritten');
  });

  // ---------------------------------------------------------------- third batch

  section('second-root: the split chain after a standalone factory( ), and the hanging form', () => {
    const head = 'CLASS zcl_roots DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\nENDCLASS.\n\nCLASS zcl_roots IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n';
    const tail = '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const broken = head + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n    view->tag( `Button` )->a( n = `text` v = client->_bind( mv_text ) ).\n' + tail;
    const hits = of(broken, 'second-root');
    assert(hits.length === 1 && hits[0].control === 'Button' && hits[0].value === 'View' && hits[0].severity === 'error', `one error naming both roots (${hits.length}, ${hits[0]?.control}/${hits[0]?.value})`);
    assert(hits[0].line === 12, `reported on the second root's statement (${hits[0].line})`);
    const hanging = head + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n    view->tag( `Button` )->a( n = `text` v = client->_bind( mv_text ) ).\n' + tail;
    assert(of(hanging, 'second-root').length === 0, 'the chain hanging off the factory( ) is one document');
  });

  section('message-box-removed-parameter: the options #2748 took off both methods', () => {
    const src = frame({ main: '    client->message_box_display( text = `x` type = `error` icon = `WARNING` contentwidth = `30rem` ).\n    client->message_toast_display( text = `saved` duration = `3000` width = `20em` ).\n' });
    const hits = of(src, 'message-box-removed-parameter');
    assert(hits.length === 3 && hits.every((h) => h.severity === 'error'), `three errors (${hits.length})`);
    assert(hits.map((h) => h.member).join(',') === 'icon,contentwidth,width', `each names its parameter (${hits.map((h) => h.member).join(',')})`);
    assert(hits[0].line === 13 && hits[2].line === 14 && hits[2].value === 'message_toast_display', 'each sits on its call and names the method');
    const fine = frame({ main: '    client->message_box_display( text = `x` type = `error` title = `T` onclose = client->_event( `CLOSE` ) ).\n    IF client->check_on_event( `CLOSE` ).\n    ENDIF.\n' });
    assert(of(fine, 'message-box-removed-parameter').length === 0, 'the parameters that stayed are fine');
  });

  section('smart-variant-without-init: the control without the handshake, and with it', () => {
    const smart = (main = '') => frame({ main, chain: '          )->tag( n = `SmartVariantManagement` ns = `smartvariants` )->a( n = `id` v = `pageVariant`\n' }).replace('        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n', '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n        )->a( n = `xmlns:smartvariants` v = `sap.ui.comp.smartvariants`\n');
    const hits = of(smart(), 'smart-variant-without-init');
    assert(hits.length === 1 && hits[0].member === 'pageVariant' && hits[0].severity === 'warning', `one warning naming the id (${hits.length}, ${hits[0]?.member})`);
    assert(of(smart('    client->follow_up_action( val = client->cs_event-smart_variant_init t_arg = VALUE #( ( `pageVariant` ) ) ).\n'), 'smart-variant-without-init').length === 0, 'the wire silences it');
  });

  section('live-event-roundtrip: every live* event, silent with check_queue_last, the fix writes the flag', () => {
    const wire = (attr, call) => frame({ chain: `          )->tag( \`Input\` )->a( n = \`${attr}\` v = ${call}\n`, main: '    IF client->check_on_event( `S` ).\n    ENDIF.\n' });
    const pos = wire('liveChange', 'client->_event( `S` )');
    const p = of(pos, 'live-event-roundtrip');
    assert(p.length === 1 && p[0].fixes?.length === 1 && p[0].member === 'liveChange', 'a positional live wire is reported with a fix');
    const out = fixed(pos, 'live-event-roundtrip');
    assert(out.includes('client->_event( val = `S` s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true ) )'), 'the positional name becomes val = and the flag follows');
    assert(of(out, 'live-event-roundtrip').length === 0, 'and the finding is gone');
    const named = fixed(wire('liveChange', 'client->_event( val = `S` arg = `${$source>/value}` )'), 'live-event-roundtrip');
    assert(named.includes('arg = `${$source>/value}` s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true ) )'), 'a named call gets the flag appended');
    assert(of(wire('liveChange', 'client->_event( val = `S` s_ctrl = VALUE #( check_queue_last = abap_true ) )'), 'live-event-roundtrip').length === 0, 'the flag silences the rule');
    const other = of(wire('liveChange', 'client->_event( val = `S` s_ctrl = ms_ctrl )'), 'live-event-roundtrip');
    assert(other.length === 1 && !other[0].fixes, 'an s_ctrl the rule cannot read: reported, no fix');
    assert(of(wire('change', 'client->_event( `S` )'), 'live-event-roundtrip').length === 0, 'a final-value event is not a live wire');
  });
}
