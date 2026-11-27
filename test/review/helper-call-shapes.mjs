/*
 * The shapes a call of the class's OWN builder helper is written in, and the
 * calls the replay does not enter - from a review of 2026-11-27, every
 * section failing on the code as it was. See test/review/README.md for the
 * harness.
 *
 *   1. `me->add_form( content ).`, `zcl_me=>add_static( content ).`,
 *      `CALL METHOD add_form EXPORTING io_parent = content.` and a helper
 *      whose handle is CHANGING (`add_footer( CHANGING co_parent = content
 *      )`) or that EXPORTS something besides were no helper calls: the view
 *      came out with an empty `<content/>`, helperTokens stayed 0, and a
 *      typo inside the helper passed (test/fixtures/helpercalls.clas.abap)
 *   2. any statement that hands a held handle to a call the replay does not
 *      enter counts as a builder call it cannot place - the render is
 *      skipped instead of a half view being judged whole
 *   3. linear in the number of helpers: a regex per helper over the whole
 *      class (parseHelpers' body lookup, the call sites of the resolver,
 *      unescaped-text-in-attribute's literal-parameter test) made a class of
 *      2,000 row helpers take 8 s
 */
import fs from 'fs';
import { scalesLinearly } from '../timing.mjs';

const frame = (stmt, { defs = '', methods = '' } = {}) => 'CLASS zcl_hc DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA name TYPE string.\n'
  + '    METHODS add_form IMPORTING io_parent TYPE REF TO z2ui5_cl_ui5_view_builder.\n' + defs
  + 'ENDCLASS.\n\nCLASS zcl_hc IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    DATA(content) = view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` )->ele( `content` ).\n'
  + `    ${stmt}\n`
  + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\n'
  + '  METHOD add_form.\n    io_parent->tag( `Input` )->a( n = `value` v = client->_bind( name ) ).\n  ENDMETHOD.\n'
  + `${methods}ENDCLASS.\n`;

export default async function ({ section, assert, f, checkAbapSource, prepareAbap }) {
  const opts = { render: false };
  const content = (src) => prepareAbap(src).docs.join('').match(/<content\/>|<content>[\s\S]*?<\/content>/)?.[0] ?? '';

  /* ── 1. the call shapes ──────────────────────────────────────────────── */

  section('helper calls: every spelling of a call of the class\'s own helper is replayed', () => {
    for (const stmt of ['add_form( content ).', 'add_form( io_parent = content ).', 'me->add_form( content ).', 'me->add_form( EXPORTING io_parent = content ).',
      'zcl_hc=>add_form( content ).', 'CALL METHOD add_form EXPORTING io_parent = content.', 'CALL METHOD me->add_form( io_parent = content ).',
      'CALL METHOD zcl_hc=>add_form EXPORTING io_parent = content.']) {
      const prep = prepareAbap(frame(stmt));
      assert(content(frame(stmt)) === '<content><Input value="{/NAME}"/></content>' && prep.helperTokens === 0,
        `${stmt} builds the Input into content (${content(frame(stmt))}, helperTokens ${prep.helperTokens})`);
    }
  });

  section('helper calls: a CHANGING handle, and EXPORTING parameters beside it, still make a helper', () => {
    const changing = frame('add_footer( CHANGING co_parent = content ).', {
      defs: '    METHODS add_footer CHANGING co_parent TYPE REF TO z2ui5_cl_ui5_view_builder.\n',
      methods: '  METHOD add_footer.\n    co_parent->tag( `Button` )->a( n = `text` v = `Go` ).\n  ENDMETHOD.\n',
    });
    assert(content(changing) === '<content><Button text="Go"/></content>', `the CHANGING handle is built into (${content(changing)})`);
    const exporting = frame('add_title( EXPORTING io_parent = content IMPORTING ev_count = DATA(count) ).', {
      defs: '    METHODS add_title IMPORTING io_parent TYPE REF TO z2ui5_cl_ui5_view_builder EXPORTING ev_count TYPE i.\n',
      methods: '  METHOD add_title.\n    io_parent->tag( `Title` )->a( n = `text` v = `T` ).\n    ev_count = 1.\n  ENDMETHOD.\n',
    });
    assert(content(exporting) === '<content><Title text="T"/></content>', `a helper exporting a count is still a helper (${content(exporting)})`);
    /* a handle the method only EXPORTS is one it hands out, not one it
     * fills: no helper - and the call passes a held handle, so it is a
     * builder call the replay cannot place */
    const handsOut = frame('make( IMPORTING eo_page = content ).', {
      defs: '    METHODS make EXPORTING eo_page TYPE REF TO z2ui5_cl_ui5_view_builder.\n',
      methods: '  METHOD make.\n    eo_page = z2ui5_cl_ui5_view_builder=>factory( ).\n  ENDMETHOD.\n',
    });
    assert(prepareAbap(handsOut).helperTokens > 0, 'an EXPORTING handle is not built into, and the view is not called complete');
  });

  section('helper calls: a typo inside a helper reached any of those ways is reported', () => {
    const r = checkAbapSource(fs.readFileSync(f('helpercalls.clas.abap'), 'utf8'), opts);
    const typos = r.findings.filter((x) => x.type === 'unknown-property').map((x) => x.member).sort().join();
    assert(typos === 'levle,txet,valeu,wrapp', `me->, CHANGING, CALL METHOD and the class's own static call each reach their helper (${typos})`);
    assert(r.helperTokens === 0 && !r.skippedRender, `and the view is whole (helperTokens ${r.helperTokens})`);
  });

  /* ── 2. a call the replay does not enter ─────────────────────────────── */

  section('helper calls: a held handle handed to a call the replay does not enter leaves the view incomplete', () => {
    for (const stmt of ['zcl_other=>fill( content ).', 'lo_filler->fill( io_parent = content ).', 'DATA(lo_sub) = NEW zcl_sub( content ).',
      'CALL METHOD lo_filler->fill EXPORTING io_parent = content.', 'CALL METHOD (`FILL`) EXPORTING io_parent = content.', 'fill( content ).']) {
      const prep = prepareAbap(frame(stmt));
      assert(prep.helperTokens > 0, `${stmt} counts as a builder call outside the replay (helperTokens ${prep.helperTokens})`);
    }
    // a parameter NAMED like the handle, or a call on the handle itself, hands nothing over
    for (const stmt of ['lo_log->add( content = `text` ).', 'DATA(n) = lines( content->get_children( ) ).']) {
      assert(prepareAbap(frame(stmt)).helperTokens === 0, `${stmt} hands no handle to anything`);
    }
  });

  /* ── 3. linear in the number of helpers ──────────────────────────────── */

  section('helper calls: a class of many row helpers is read in linear time', () => {
    const many = (n) => {
      const defs = Array.from({ length: n }, (_, i) => `    METHODS add_${i} IMPORTING io_parent TYPE REF TO z2ui5_cl_ui5_view_builder iv_text TYPE string.\n`).join('');
      const calls = Array.from({ length: n }, (_, i) => `    add_${i}( io_parent = content iv_text = \`x${i}\` ).\n`).join('');
      const bodies = Array.from({ length: n }, (_, i) => `  METHOD add_${i}.\n    io_parent->tag( \`Text\` )->a( n = \`text\` v = iv_text ).\n  ENDMETHOD.\n`).join('');
      return 'CLASS zcl_big DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n' + defs + 'ENDCLASS.\n\nCLASS zcl_big IMPLEMENTATION.\n'
        + '  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
        + '    DATA(content) = view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` )->ele( `content` ).\n'
        + calls + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\n' + bodies + 'ENDCLASS.\n';
    };
    const small = checkAbapSource(many(3), opts);
    assert(/<Text text="x0"\/><Text text="x1"\/><Text text="x2"\/>/.test(small.docs[0]) && !small.findings.some((x) => x.type === 'unescaped-text-in-attribute'),
      'each helper\'s literal parameter resolves, and is no data written through v');
    // the old code: 400 helpers 0.5 s, 1,600 helpers 6 s
    const r = scalesLinearly(many, (src) => checkAbapSource(src, opts), 400);
    assert(r.ok, `four times the helpers, not sixteen times the time (${r.small} ms -> ${r.big} ms)`);
  });
}
