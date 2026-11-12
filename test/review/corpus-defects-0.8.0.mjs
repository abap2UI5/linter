/*
 * The 2026-09-27 round: five defects linter 0.8.0 showed over the abap2UI5
 * corpora, each with the shape that reproduced it. unbound-public-attribute
 * measuring its offsets on the collapsed text (a TYPES structure shifted the
 * findings and broke the TYPE REF TO check); the reconstructor rendering a
 * literal `b = abap_false` as "true"; handler-without-event reading every
 * WHEN as a handler; smart-variant-without-init not knowing
 * `filter_bar_variant_init`; frontend-action-as-backend-event reading the
 * class's own `cs_event` constant as the client's. See test/review/README.md
 * for the harness.
 */

/* A complete app class around one main( ): `defs` lands in the PUBLIC
 * SECTION, `main` before the view is built, `attrs` on the view's Button,
 * `chain` after the Button, `xmlns` beside the two namespace declarations,
 * `prot` in the PROTECTED SECTION, `methods` after main( ). */
const frame = ({ defs = '', main = '', attrs = '', chain = '', xmlns = '', prot = '', methods = '' } = {}) =>
  'CLASS zcl_review_round0927 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
  + defs
  + '  PROTECTED SECTION.\n' + prot + '  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_review_round0927 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + main
  + '\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`     v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + xmlns
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

import { applyFixes } from '../../lib/fix.mjs';

export default async function ({ section, assert, checkAbapSource, prepareAbap }) {
  const opts = { render: false, properties: true, minUi5: '1.120' };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;

  section('round 2026-09-27: the frame is clean', () => {
    const noise = judge(frame()).map((x) => x.type);
    assert(noise.length === 0, `the frame reports nothing on its own (${noise.join(', ') || 'none'})`);
  });

  // ------------------------------------------------ 1. unbound-public-attribute

  section('unbound-public-attribute: a TYPES structure before the attributes shifts neither the line nor the TYPE REF TO check', () => {
    const src = frame({
      defs: '    TYPES:\n'
        + '      BEGIN OF ty_s_row,\n'
        + '        carrid TYPE string,\n'
        + '        connid TYPE string,\n'
        + '      END OF ty_s_row.\n\n'
        + '    " a comment the shifted offset used to land in\n'
        + '    " and a second one\n'
        + '    DATA mv_state TYPE string.\n'
        + '    DATA mo_other TYPE REF TO zcl_review_other.\n'
        + '    DATA mt_data  TYPE REF TO data.\n'
        + '    DATA mv_dead  TYPE string.\n',
      main: '    mv_state = `x`.\n    mo_other = NEW #( ).\n    CREATE DATA mt_data TYPE string.\n',
    });
    const unbound = of(src, 'unbound-public-attribute');
    assert(unbound.length === 1 && unbound[0].member === 'mv_state',
      `only mv_state is reported - mo_other and mt_data are references (${unbound.map((x) => x.member).join(', ')})`);
    assert(unbound[0]?.line === lineOf(src, 'DATA mv_state'), `on its declaration, not in the comment above (${unbound[0]?.line} vs ${lineOf(src, 'DATA mv_state')})`);
    const unused = of(src, 'unused-public-attribute');
    assert(unused.length === 1 && unused[0].member === 'mv_dead' && unused[0].line === lineOf(src, 'DATA mv_dead'),
      `the unused sibling reads the same walk and lands on its line too (${unused.map((x) => `${x.member}@${x.line}`).join(', ')})`);
    // the inline DATA structure the collapse was written for still registers as ONE attribute
    const inline = frame({
      defs: '    DATA: BEGIN OF ms_email,\n            text TYPE string,\n          END OF ms_email.\n    DATA mv_after TYPE string.\n',
      main: '    ms_email-text = `x`.\n    mv_after = `y`.\n',
    });
    const both = of(inline, 'unbound-public-attribute').map((x) => `${x.member}@${x.line}`).sort();
    assert(both.join() === [`ms_email@${lineOf(inline, 'BEGIN OF ms_email')}`, `mv_after@${lineOf(inline, 'DATA mv_after')}`].sort().join(),
      `an inline structure is one attribute, and the one after it keeps its line (${both.join(', ')})`);
  });

  // ------------------------------------------------ 2. reconstruct: b = abap_false

  section('reconstruct: a literal b = abap_false renders "false", as the builder does', () => {
    const doc = (b) => prepareAbap(frame({ attrs: `            )->a( n = \`enabled\` b = ${b}\n` })).docs[0];
    for (const lit of ['abap_false', 'ABAP_FALSE', 'space', '\' \'', '``']) {
      assert(/<Button[^>]*enabled="false"/.test(doc(lit)), `b = ${lit} is enabled="false"`);
    }
    for (const lit of ['abap_true', 'mv_flag', 'xsdbool( mv_text IS INITIAL )']) {
      assert(/<Button[^>]*enabled="true"/.test(doc(lit)), `b = ${lit} stays enabled="true" as before`);
    }
    // the false positive it caused: a disabled Input fed by a literal is not an input
    const input = (b) => frame({ chain: `          )->tag( \`Input\` )->a( n = \`enabled\` b = ${b} )->a( n = \`value\` v = \`fixed\`\n` });
    assert(of(input('abap_false'), 'editable-control-without-binding').length === 0, 'an Input disabled by b = abap_false is not judged');
    assert(of(input('abap_true'), 'editable-control-without-binding').length === 1, 'the same Input enabled by b = abap_true still is');
  });

  // ------------------------------------------------ 3. handler-without-event

  section('handler-without-event: only the WHENs of a CASE over the event are handlers', () => {
    const src = frame({
      attrs: '            )->a( n = `press` v = client->_event( `SAVE` )\n',
      main: '    CASE client->get_event( ).\n'
        + '      WHEN `SAVE`.\n'
        + '        CASE mv_text.\n          WHEN `NESTED`.\n        ENDCASE.\n'
        + '      WHEN `GHOST`.\n'
        + '    ENDCASE.\n'
        + '    DATA(lv_operator) = to_upper( mv_text ).\n'
        + '    CASE lv_operator.\n      WHEN `EQ`.\n      WHEN `CONTAINS`.\n    ENDCASE.\n'
        + '    CASE mv_text.\n      WHEN `n`.\n    ENDCASE.\n',
    });
    const found = of(src, 'handler-without-event');
    assert(found.map((x) => x.value).join() === 'GHOST', `only GHOST, in the event CASE (${found.map((x) => x.value).join(', ')})`);
    assert(found[0]?.line === lineOf(src, 'WHEN `GHOST`'), 'on its WHEN');

    // the event read into a variable, and handed to a method as a parameter
    const indirect = frame({
      attrs: '            )->a( n = `press` v = client->_event( `SAVE` )\n',
      prot: '    METHODS on_event IMPORTING event TYPE string.\n',
      main: '    DATA(lv_event) = client->get( )-event.\n'
        + '    CASE lv_event.\n      WHEN `SAVE`.\n      WHEN `DEAD_VAR`.\n    ENDCASE.\n'
        + '    on_event( client->get_event( ) ).\n',
      methods: '  METHOD on_event.\n    CASE event.\n      WHEN `DEAD_PARAM`.\n    ENDCASE.\n  ENDMETHOD.\n\n',
    });
    const hits = of(indirect, 'handler-without-event').map((x) => x.value).sort();
    assert(hits.join() === 'DEAD_PARAM,DEAD_VAR', `a variable assigned from the event and a parameter handed it are the event (${hits.join(', ')})`);
  });

  section('handler-without-event: a SWITCH\'s WHEN is no handler, and a CASE inside a literal opens no block', () => {
    const src = frame({
      attrs: '            )->a( n = `press` v = client->_event( `SAVE` )\n',
      prot: '    METHODS refresh.\n',
      main: '    CASE client->get_event( ).\n'
        + '      WHEN `SAVE`.\n'
        + '        mv_text = SWITCH #( mv_text WHEN `Phone` THEN `M` WHEN `Tablet` THEN `L` ELSE `XL` ).\n'
        + '        client->message_toast_display( `a text about a USE CASE` ).\n'
        + '        client->message_box_display( text = `CASE one, CASE two` ).\n'
        + '    ENDCASE.\n',
      methods: '  METHOD refresh.\n    CASE mv_text.\n      WHEN `inStock`.\n    ENDCASE.\n  ENDMETHOD.\n\n',
    });
    const found = of(src, 'handler-without-event').map((x) => x.value);
    assert(found.length === 0, `neither the SWITCH arms nor the CASE of another method are handlers (${found.join(', ')})`);
  });

  section('handler-without-event: the event a hash_attach_changed listener raises is raised', () => {
    const src = (wire) => frame({
      attrs: '            )->a( n = `press` v = client->_event( `SAVE` )\n',
      main: `    ${wire}\n`
        + '    CASE client->get_event( ).\n      WHEN `SAVE`.\n      WHEN `HASH_CHANGED`.\n    ENDCASE.\n',
    });
    for (const wire of [
      'client->follow_up_action( val = z2ui5_if_client=>cs_event-hash_attach_changed t_arg = VALUE #( ( `HASH_CHANGED` ) ) ).',
      'client->follow_up_action( val = `HASH_ATTACH_CHANGED` t_arg = VALUE #( ( `HASH_CHANGED` ) ) ).',
    ]) {
      const found = of(src(wire), 'handler-without-event').map((x) => x.value);
      assert(found.length === 0, `HASH_CHANGED is raised by the listener: ${wire} (${found.join(', ')})`);
    }
    // and like a timer's event, one no branch handles is a dead wire
    const dead = frame({ main: '    client->follow_up_action( val = client->cs_event-hash_attach_changed t_arg = VALUE #( ( `HASH_GONE` ) ) ).\n' });
    assert(of(dead, 'event-without-handler').map((x) => x.value).join() === 'HASH_GONE', 'an unhandled listener event is event-without-handler\'s, as a timer\'s is');
  });

  section('handler-without-event: an onclose name is raised - the message methods\' parameter and the onClose option', () => {
    const src = frame({
      attrs: '            )->a( n = `press` v = client->_event( `SAVE` )\n',
      main: '    CASE client->get_event( ).\n'
        + '      WHEN `SAVE`.\n'
        + '        client->message_box_display( text = `Delete?` onclose = `BOX_CLOSED` ).\n'
        + '        client->message_toast_display( text = `Saved` onclose = \'TOAST_DONE\' ).\n'
        + '        client->follow_up_action( val = client->cs_event-control_global t_arg = VALUE #( ( `MESSAGE_BOX` ) ( `warning` ) ( `Sure?` )\n'
        + '          ( `{"actions":["OK","CANCEL"],"onClose":"ANSWERED"}` ) ) ).\n'
        + '      WHEN `BOX_CLOSED`.\n'
        + '      WHEN `TOAST_DONE`.\n'
        + '      WHEN `ANSWERED`.\n'
        + '      WHEN `NEVER`.\n'
        + '    ENDCASE.\n',
    });
    const found = of(src, 'handler-without-event').map((x) => x.value);
    assert(found.join() === 'NEVER', `the three close events are raised, NEVER is not (${found.join(', ')})`);
  });

  // ------------------------------------------------ 4. smart-variant-without-init

  section('smart-variant-without-init: filter_bar_variant_init is the handshake too', () => {
    const smart = (main = '') => frame({
      main,
      xmlns: '        )->a( n = `xmlns:smartvariants` v = `sap.ui.comp.smartvariants`\n',
      chain: '          )->tag( n = `SmartVariantManagement` ns = `smartvariants` )->a( n = `id` v = `variantMgmt`\n',
    });
    assert(of(smart(), 'smart-variant-without-init').length === 1, 'without any wire it is reported');
    for (const wire of [
      'client->follow_up_action( val = client->cs_event-filter_bar_variant_init t_arg = VALUE #( ( `variantMgmt` ) ( `filterBar` ) ) )',
      'client->follow_up_action( val = z2ui5_if_client=>cs_event-filter_bar_variant_init t_arg = VALUE #( ( `variantMgmt` ) ( `filterBar` ) ) )',
      'client->follow_up_action( val = `FILTER_BAR_VARIANT_INIT` t_arg = VALUE #( ( `variantMgmt` ) ( `filterBar` ) ) )',
    ]) {
      assert(of(smart(`    ${wire}.\n`), 'smart-variant-without-init').length === 0, `silent: ${wire}`);
    }
  });

  // ------------------------------------------------ missing-on-navigated-branch

  section('missing-on-navigated-branch: a sub-app that builds into its parent\'s view displays nothing, whatever its method is called', () => {
    /* samples apps 105 and 112: the parent hands over a builder handle and
     * displays; the sub-app's own `view_display( )` only builds into it. */
    const sub = (display) => 'CLASS zcl_review_sub0927 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
      + '    DATA view_parent TYPE REF TO z2ui5_cl_ui5_view_builder.\n    DATA mv_text TYPE string.\n    METHODS view_display.\n'
      + '  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
      + 'CLASS zcl_review_sub0927 IMPLEMENTATION.\n\n  METHOD view_display.\n'
      + '    view_parent->tag( `Input` )->a( n = `value` v = client->_bind( mv_text ) ).\n'
      + display
      + '  ENDMETHOD.\n\n  METHOD z2ui5_if_app~main.\n    me->client = client.\n'
      + '    IF client->check_on_init( ).\n      view_display( ).\n    ENDIF.\n  ENDMETHOD.\n\nENDCLASS.\n';
    const quiet = of(sub(''), 'missing-on-navigated-branch');
    assert(quiet.length === 0, `a method named view_display( ) is not client->view_display( ) (${quiet.length})`);
    const own = sub('    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    view->ele( `Page` ).\n    client->view_display( view->stringify( ) ).\n');
    assert(of(own, 'missing-on-navigated-branch').length === 1, 'the same app displaying its own view still needs the branch');
  });

  // ------------------------------------------------ unused-namespace-declaration --fix

  section('unused-namespace-declaration: the fix removes the LAST declaration of a chain too, closing it on the line before', () => {
    const root = (decls) => 'CLASS zcl_review_ns0927 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
      + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\nCLASS zcl_review_ns0927 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
      + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory(\n'
      + '        )->ele( n = `View` ns = `mvc`\n'
      + '            )->a( n = `xmlns`      v = `sap.m`\n'
      + decls
      + '    view->ele( `Page` )->tag( `Input` )->a( n = `value` v = client->_bind( mv_text ) ).\n'
      + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\nENDCLASS.\n';
    const fixAll = (src) => {
      for (let pass = 0; pass < 4; pass++) {
        const hits = of(src, 'unused-namespace-declaration');
        const out = applyFixes(src, hits).output;
        if (out === src) break;
        src = out;
      }
      return src;
    };
    const clean = root('            )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc` ).\n');
    const one = root('            )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`\n            )->a( n = `xmlns:form` v = `sap.ui.layout.form` ).\n');
    const hit = of(one, 'unused-namespace-declaration');
    assert(hit.length === 1 && hit[0].fixes?.length === 1, `the last declaration carries a fix (${hit.map((x) => x.member).join(', ')})`);
    assert(fixAll(one) === clean, 'its statement end moves onto the line before');
    const two = root('            )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`\n            )->a( n = `xmlns:core` v = `sap.ui.core`\n            )->a( n = `xmlns:form` v = `sap.ui.layout.form` ).\n');
    assert(fixAll(two) === clean, 'two stale ones in a row, the last of them ending the chain (--fix run to the end)');
    const fixed = judge(fixAll(two)).map((x) => x.type);
    assert(fixed.length === 0, `the fixed source is clean and balanced (${fixed.join(', ') || 'none'})`);
    // the line before carries a comment: the paren cannot be moved behind it
    const comment = root('            )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc` " the root\'s own\n            )->a( n = `xmlns:form` v = `sap.ui.layout.form` ).\n');
    assert(of(comment, 'unused-namespace-declaration')[0]?.fixes === undefined, 'a comment on the line before leaves it without a fix');
  });

  // ------------------------------------------------ 5. frontend-action-as-backend-event

  section('frontend-action-as-backend-event: the class\'s own cs_event constant is not the client\'s', () => {
    const own = '    CONSTANTS:\n      BEGIN OF cs_event,\n        search TYPE string VALUE `SEARCH`,\n      END OF cs_event.\n';
    const wire = (defs, call) => frame({ defs, attrs: `            )->a( n = \`press\` v = ${call}\n`, main: '    IF client->check_on_event( cs_event-search ).\n    ENDIF.\n' });
    for (const call of ['client->_event( cs_event-search )', 'client->_event( val = cs_event-search )', 'client->_event( me->cs_event-search )', 'client->_event( zcl_review_round0927=>cs_event-search )']) {
      const hits = of(wire(own, call), 'frontend-action-as-backend-event');
      assert(hits.length === 0, `silent on the own constant: ${call} (${hits.map((x) => x.member).join(', ')})`);
    }
    for (const call of ['client->_event( client->cs_event-popup_close )', 'client->_event( z2ui5_if_client=>cs_event-popup_close )']) {
      assert(of(wire(own, call), 'frontend-action-as-backend-event').length === 1, `the client's constant is still reported beside an own one: ${call}`);
    }
    assert(of(wire('', 'client->_event( cs_event-popup_close )'), 'frontend-action-as-backend-event').length === 1,
      'without an own declaration the bare spelling is the interface\'s, as before');
  });
}
