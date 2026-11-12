/*
 * The 2026-10-12 round: the reconstructor against the spellings a port
 * writes that the samples do not - `me->`, a client kept under another name,
 * colon-chained METHODS, a RETURNING parameter not named `result`, constants
 * as element names, pragmas on declarations, conditionals inside a VALUE
 * seed, FINAL( ) - and chain-house-layout's --fix on a `*` comment. See
 * test/review/README.md for the harness.
 *
 *   1. --fix leaves a `*` comment line in column 1 (indented it is a syntax
 *      error, not a comment)
 *   2. `me->x = …` seeds x; a view held in `me->mo_view` is a document
 *   3. `METHODS:` chained helpers, a void method declared ahead of a
 *      RETURNING helper, a RETURNING parameter named `ro_view`
 *   4. a helper parameter named `text` is not substituted inside `` `text` ``
 *   5. `ele( n = c_page )` resolves through the constant; an unresolvable
 *      name still opens an element the next end( ) closes
 *   6. `VALUE 'x' ##NO_TEXT` declares the variable and the constant
 *   7. `mo_client->_bind( )` / `me->client->_bind( )` are bindings
 *   8. a COND inside a VALUE #( ) row leaks nothing and seeds its ELSE
 *   9. FINAL(view) = factory( ) is a handle
 *  10. an IMPORTING DEFAULT is the value an omitting call passes; `v = 20`
 *      is the number
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export default function ({ section, assert, FIX, tempDir, checkAbapSource, prepareAbap }) {
  const opts = { render: false };
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const types = (src) => checkAbapSource(src, opts).findings.map((x) => x.type).sort();
  const HEAD = '    view->ele( n = `View` ns = `mvc`\n        )->a( n = `xmlns`     v = `sap.m`\n        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n';
  /* a class: `definition` goes into the PUBLIC SECTION (after the interface
   * and the client), `main` is the body of z2ui5_if_app~main, `more` further
   * method implementations */
  const cls = (definition, main, more = '') => 'CLASS zcl_r DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
    + '    DATA client TYPE REF TO z2ui5_if_client.\n' + definition + 'ENDCLASS.\nCLASS zcl_r IMPLEMENTATION.\n'
    + `  METHOD z2ui5_if_app~main.\n${main}  ENDMETHOD.\n${more}ENDCLASS.\n`;

  /* ── 1. chain-house-layout --fix and a `*` comment ───────────────────── */

  /* The fix moved every continuation line of a segment by the segment's
   * delta - a `*` comment line among them, which is a comment in column 1
   * only. The rewritten class did not activate. A comment line keeps its
   * column now, `"` comments too: their indent is the author's. */
  section('round 2026-10-12: chain-house-layout --fix keeps a * comment in column 1', () => {
    const src = cls('', '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc`\n      )->a( n = `xmlns`     v = `sap.m`\n      )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
      + '* star comment inside\n      )->ele( `Page` )->a( n = `title` v = `T`\n          " line comment\n          )->tag( `Text` )->a( n = `text` v = |one|\n'
      + '      )->end( ).\n    client->view_display( view->stringify( ) ).\n');
    const dir = tempDir('a2u5-house-');
    const cfg = path.join(dir, 'abap2ui5lint.jsonc');
    fs.writeFileSync(cfg, '{ "rules": { "chain-house-layout": "warning" } }');
    const file = path.join(dir, 'zcl_r.clas.abap');
    fs.writeFileSync(file, src);
    cp.spawnSync('node', [CLI, '--no-render', '--config', cfg, '--fix', file], { encoding: 'utf8', env: ENV });
    const fixed = fs.readFileSync(file, 'utf8');
    assert(fixed !== src && /\n {8}\)->ele\( `Page`\n {12}\)->a\( n = `title`/.test(fixed),
      `the chain is re-laid, one call per line (${fixed.split('\n').filter((l) => l.includes('Page') || l.includes('title')).join(' | ')})`);
    assert(/^\* star comment inside$/m.test(fixed), 'the * comment stays in column 1 - indented it is no comment');
    assert(/^ {10}" line comment$/m.test(fixed), 'a " comment line keeps the indent its author gave it');
    // the house-layout finding is a layout matter, not a change of the view
    assert(prepareAbap(fixed).docs.join('') === prepareAbap(src).docs.join(''), 'the fixed class builds the same view');
  });

  /* ── 2. me-> ─────────────────────────────────────────────────────────── */

  /* `me->mv_type = \`Error\`` seeded nothing: the enum rendered as "" and
   * the render gate reported it. `me->mo_view = …factory( )` and
   * `me->mo_page->tag( )` were no handle, and the class had no document. */
  section('round 2026-10-12: me->x = … is the write x = … is, me->mo_view the handle mo_view is', () => {
    const def = '    TYPES: BEGIN OF ty_row, text TYPE string, state TYPE string, END OF ty_row.\n'
      + '    DATA mt_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n    DATA mv_type TYPE string.\n    METHODS view_display.\n';
    const body = (own) => `    me->client = client.\n    IF client->check_on_init( ).\n      ${own}mv_type = \`Error\`.\n      ${own}mt_rows = VALUE #( ( text = \`a\` state = \`Success\` ) ).\n      view_display( ).\n    ENDIF.\n`;
    const view = '  METHOD view_display.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n' + HEAD
      + '        )->ele( `Page`\n            )->tag( `MessageStrip` )->a( n = `type` v = client->_bind( mv_type )\n'
      + '            )->ele( `List` )->a( n = `items` v = client->_bind( mt_rows )\n                )->tag( `ObjectStatus` )->a( n = `state` v = `{STATE}`\n'
      + '        )->end( )->end( ).\n    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\n';
    const plain = prepareAbap(cls(def, body(''), view));
    const own = prepareAbap(cls(def, body('me->'), view));
    assert(plain.model.MV_TYPE === 'Error' && plain.model.MT_ROWS.length === 1, 'the plain spelling seeds (the baseline)');
    assert(JSON.stringify(own.model) === JSON.stringify(plain.model) && JSON.stringify(own.initModel) === JSON.stringify(plain.initModel),
      `me-> seeds the same model (${JSON.stringify(own.model)} / ${JSON.stringify(own.initModel)})`);
    assert(own.docs.join('') === plain.docs.join(''), 'and builds the same document');
    assert(types(cls(def, body('me->'), view)).join() === types(cls(def, body(''), view)).join(), 'the two spellings are judged alike');

    // a view held in attributes, built on through `me->`
    const held = cls('  PRIVATE SECTION.\n    DATA mo_view TYPE REF TO z2ui5_cl_ui5_view_builder.\n    DATA mo_page TYPE REF TO z2ui5_cl_ui5_view_builder.\n',
      '    me->mo_view = z2ui5_cl_ui5_view_builder=>factory( ).\n    me->mo_page = me->mo_view->ele( n = `View` ns = `mvc`\n'
      + '        )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n'
      + '    me->mo_page->tag( `Text` )->a( n = `text` v = `one` ).\n    me->mo_page->tag( `Text` )->a( n = `text` v = `two` ).\n'
      + '    client->view_display( me->mo_view->stringify( ) ).\n');
    const docs = prepareAbap(held).docs;
    assert(docs.length === 1 && docs[0].includes('<Page><Text text="one"/><Text text="two"/></Page>'),
      `handles kept in attributes build the document (${docs.join('') || 'none'})`);
  });

  /* ── 3. helper declarations ──────────────────────────────────────────── */

  /* Three readings of a METHODS statement that hid a helper: the keyword was
   * required in front of every name, so a `METHODS:` chain declared none;
   * the lazy IMPORTING…RETURNING ran from a void method's declaration across
   * its period into the next, so a void method ahead of a RETURNING helper
   * swallowed it; and the returning parameter had to be called `result`. */
  section('round 2026-10-12: helpers in a METHODS: chain, declared after a void method, returning ro_view', () => {
    const main = '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    DATA(page) = view->ele( n = `View` ns = `mvc`\n'
      + '        )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n'
      + '    render_title( page ).\n    add_button( io_view = page text = `Save` ).\n    client->view_display( view->stringify( ) ).\n';
    const impl = (ret) => '  METHOD render_title.\n    io_page->tag( `Title` )->a( n = `text` v = `T` ).\n  ENDMETHOD.\n'
      + `  METHOD add_button.\n    ${ret} = io_view->tag( \`Button\` )->a( n = \`text\` v = text ).\n  ENDMETHOD.\n`;
    const want = '<Page><Title text="T"/><Button text="Save"/></Page>';
    const chained = cls('  PRIVATE SECTION.\n    METHODS:\n      render_title IMPORTING io_page TYPE REF TO z2ui5_cl_ui5_view_builder,\n'
      + '      add_button IMPORTING io_view TYPE REF TO z2ui5_cl_ui5_view_builder text TYPE string\n'
      + '        RETURNING VALUE(result) TYPE REF TO z2ui5_cl_ui5_view_builder.\n', main, impl('result'));
    assert(prepareAbap(chained).docs.join('').includes(want), `METHODS: chain - both helpers build (${prepareAbap(chained).docs.join('')})`);
    const ordered = cls('  PRIVATE SECTION.\n    METHODS render_title IMPORTING io_page TYPE REF TO z2ui5_cl_ui5_view_builder.\n'
      + '    METHODS add_button IMPORTING io_view TYPE REF TO z2ui5_cl_ui5_view_builder text TYPE string\n'
      + '      RETURNING VALUE(result) TYPE REF TO z2ui5_cl_ui5_view_builder.\n', main, impl('result'));
    assert(prepareAbap(ordered).docs.join('').includes(want), `a void method declared first does not hide the RETURNING helper (${prepareAbap(ordered).docs.join('')})`);
    const named = cls('  PRIVATE SECTION.\n    METHODS render_title IMPORTING io_page TYPE REF TO z2ui5_cl_ui5_view_builder.\n'
      + '    METHODS add_button IMPORTING io_view TYPE REF TO z2ui5_cl_ui5_view_builder text TYPE string\n'
      + '      RETURNING VALUE(ro_view) TYPE REF TO z2ui5_cl_ui5_view_builder.\n', main, impl('ro_view'));
    assert(prepareAbap(named).docs.join('').includes(want), `the returning parameter may have any name (${prepareAbap(named).docs.join('')})`);
    assert(prepareAbap(named).helperTokens === 0, 'nothing is left unattributed');
  });

  /* ── 4. a parameter named like a literal's text ─────────────────────── */

  /* The RETURNING helper is inlined with its parameters substituted
   * textually, and `\btext\b` matched inside `` `text` `` too: `n = \`text\``
   * became `n = \`\`Save\`\``, which parses as no attribute at all. Code
   * spans only now. */
  section('round 2026-10-12: a RETURNING helper parameter is substituted in code, never inside a literal', () => {
    const src = cls('  PRIVATE SECTION.\n    METHODS add_button IMPORTING io_view TYPE REF TO z2ui5_cl_ui5_view_builder text TYPE string\n'
      + '      RETURNING VALUE(result) TYPE REF TO z2ui5_cl_ui5_view_builder.\n',
    '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    DATA(page) = view->ele( n = `View` ns = `mvc`\n'
      + '        )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n'
      + '    add_button( io_view = page text = `Save` ).\n    client->view_display( view->stringify( ) ).\n',
    '  METHOD add_button.\n    result = io_view->tag( `Button` )->a( n = `text` v = text )->a( n = `tooltip` v = |text: { text }| ).\n  ENDMETHOD.\n');
    const prep = prepareAbap(src);
    assert(prep.docs.join('').includes('<Button text="Save" tooltip="text: Save"/>'),
      `the attribute is named text and valued Save (${prep.docs.join('')})`);
    assert(!prep.notes.some((n) => n.startsWith('unparsed attribute call')), 'no attribute call is left unparsed');
  });

  /* ── 5. an element name given as a constant ─────────────────────────── */

  /* `ele( n = c_page )` was an "unparsed element call": the element was
   * dropped, its children were reparented into the element above (a false
   * unknown-property on their attributes) and its end( ) closed that one
   * instead (a false excess-shut). The resolver knew the constant all along. */
  section('round 2026-10-12: n = c_page resolves; an unresolvable name still opens and closes an element', () => {
    const chain = (name, attr) => '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n' + HEAD
      + `        )->ele( n = ${name}\n            )->a( n = ${attr} v = \`Hello\`\n            )->a( n = \`showHeader\` b = abap_true\n`
      + '            )->tag( `Text` )->a( n = `text` v = `hi`\n        )->end(\n        )->end( ).\n    client->view_display( view->stringify( ) ).\n';
    const constant = cls('    CONSTANTS c_page TYPE string VALUE `Page`.\n    CONSTANTS c_attr TYPE string VALUE `title`.\n', chain('c_page', 'c_attr'));
    const prep = prepareAbap(constant);
    assert(prep.docs.join('').includes('<Page title="Hello" showHeader="true"><Text text="hi"/></Page>'),
      `the constant names the element and the attribute (${prep.docs.join('')})`);
    assert(!prep.structure.length && !types(constant).some((t) => t === 'excess-shut' || t === 'unknown-property'),
      `nothing is reported on a correct chain (${types(constant).join() || 'none'})`);
    // a name nothing in the class gives a value: the element is there, nameless
    const unknown = cls('    METHODS build IMPORTING iv_name TYPE string.\n', '    build( `Page` ).\n',
      '  METHOD build.\n' + chain('iv_name', '`title`') + '  ENDMETHOD.\n');
    const u = prepareAbap(unknown);
    assert(u.docs.join('').includes('<Text text="hi"/>') && !u.docs.join('').includes('title="Hello"'),
      `the children stay, the attributes of the unnamed element are not put on the element above (${u.docs.join('')})`);
    assert(!u.structure.length && !types(unknown).includes('excess-shut') && !types(unknown).includes('attribute-without-element'),
      `its end( ) closes it - no excess-shut, no attribute-without-element (${types(unknown).join() || 'none'})`);
  });

  /* ── 6. a pragma after VALUE ─────────────────────────────────────────── */

  section('round 2026-10-12: VALUE \'x\' ##NO_TEXT still declares the variable and the constant', () => {
    const src = cls('    CONSTANTS c_title TYPE string VALUE \'My Title\' ##NO_TEXT.\n    DATA mv_state TYPE string VALUE \'Success\' ##NO_TEXT.\n',
      '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n' + HEAD
      + '        )->ele( `Page` )->a( n = `title` v = c_title\n            )->tag( `ObjectStatus` )->a( n = `state` v = client->_bind( mv_state )\n'
      + '        )->end( ).\n    client->view_display( view->stringify( ) ).\n');
    const prep = prepareAbap(src);
    assert(prep.docs.join('').includes('<Page title="My Title">'), `the constant resolves (${prep.docs.join('')})`);
    assert(prep.model.MV_STATE === 'Success', `the declared VALUE is the seed (${JSON.stringify(prep.model)})`);
    assert(!prep.notes.some((n) => n.includes('no DATA declaration')), 'the variable is declared');
  });

  /* ── 7. the client under another name ────────────────────────────────── */

  section('round 2026-10-12: mo_client->_bind( ) and me->client->_bind( ) are bindings, as the event rules read them', () => {
    const src = cls('    DATA mv_name TYPE string.\n    DATA mo_client TYPE REF TO z2ui5_if_client.\n',
      '    mo_client = client.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n' + HEAD
      + '        )->ele( `Page`\n            )->tag( `Input` )->a( n = `value` v = mo_client->_bind_edit( mv_name )\n'
      + '            )->tag( `Input` )->a( n = `value` v = me->mo_client->_bind( mv_name )\n'
      + '            )->tag( `Input` )->a( n = `value` v = me->client->_bind( mv_name )\n'
      + '        )->end( ).\n    mo_client->view_display( view->stringify( ) ).\n');
    const prep = prepareAbap(src);
    assert((prep.docs.join('').match(/value="\{\/MV_NAME\}"/g) ?? []).length === 3, `all three bindings reconstruct (${prep.docs.join('')})`);
    assert(!prep.notes.some((n) => n.startsWith('unresolved value expression')), 'none is dropped as unresolvable');
    assert('MV_NAME' in prep.model, 'the bound variable is in the model');
  });

  /* ── 8. a conditional inside a VALUE #( ) row ───────────────────────── */

  /* The row reader took the seed pair by pair, so `mv_ok = abap_true`
   * inside a COND's WHEN became a FIELD of the row, and the field the COND
   * was the value of was seeded "" - a false render error on an enum. */
  section('round 2026-10-12: a COND in a row seeds its ELSE and leaks no operand', () => {
    const def = '    TYPES: BEGIN OF ty_row, id TYPE i, text TYPE string, state TYPE string, END OF ty_row.\n'
      + '    DATA mt_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n    DATA mv_ok TYPE abap_bool.\n    METHODS get_state RETURNING VALUE(result) TYPE string.\n';
    const view = '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n' + HEAD
      + '        )->ele( `Page` )->ele( `List` )->a( n = `items` v = client->_bind( mt_rows )\n'
      + '            )->ele( `CustomListItem` )->tag( `ObjectStatus` )->a( n = `text` v = `{TEXT}` )->a( n = `state` v = `{STATE}`\n'
      + '        )->end( )->end( )->end( ).\n    client->view_display( view->stringify( ) ).\n';
    const src = cls(def, '    mv_ok = abap_true.\n    mt_rows = VALUE #( ( id = 1 text = `a` state = COND #( WHEN mv_ok = abap_true THEN `Success` ELSE `Error` ) )\n'
      + '                       ( id = 2 text = `b` state = SWITCH #( mv_ok WHEN abap_true THEN `Warning` ELSE `None` ) )\n'
      + '                       ( id = 3 text = `c` state = get_state( ) ) ).\n' + view,
    '  METHOD get_state.\n    result = `Information`.\n  ENDMETHOD.\n');
    const { model, modelShape } = prepareAbap(src);
    assert(JSON.stringify(model.MT_ROWS) === JSON.stringify([{ ID: 1, TEXT: 'a', STATE: 'Error' }, { ID: 2, TEXT: 'b', STATE: 'None' }, { ID: 3, TEXT: 'c' }]),
      `the ELSE value where every branch is a literal, no field at all for a method result, and no MV_OK (${JSON.stringify(model.MT_ROWS)})`);
    assert(modelShape.MT_ROWS.every((r) => 'STATE' in r && !('MV_OK' in r)), `the shape keeps the declared field and nothing else (${JSON.stringify(modelShape.MT_ROWS)})`);
  });

  /* ── 9. FINAL( ) ─────────────────────────────────────────────────────── */

  section('round 2026-10-12: FINAL(view) = factory( ) is a handle like DATA(view)', () => {
    const src = cls('  PRIVATE SECTION.\n    METHODS render_title IMPORTING io_page TYPE REF TO z2ui5_cl_ui5_view_builder.\n',
      '    FINAL(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    FINAL(page) = view->ele( n = `View` ns = `mvc`\n'
      + '        )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n'
      + '    render_title( page ).\n    page->tag( `Text` )->a( n = `text` v = `hi` ).\n    client->view_display( view->stringify( ) ).\n',
      '  METHOD render_title.\n    io_page->tag( `Title` )->a( n = `text` v = `T` ).\n  ENDMETHOD.\n');
    const prep = prepareAbap(src);
    assert(prep.docs.join('').includes('<Page><Title text="T"/><Text text="hi"/></Page>') && prep.helperTokens === 0,
      `the FINAL handles carry the chain and the helper (${prep.docs.join('') || 'none'}, ${prep.helperTokens} unattributed)`);
  });

  /* ── 10. IMPORTING DEFAULT, a numeric value ──────────────────────────── */

  section('round 2026-10-12: a DEFAULT is what an omitting call passes; v = 20 is the number', () => {
    const src = cls('  PRIVATE SECTION.\n    METHODS add_button IMPORTING io_page TYPE REF TO z2ui5_cl_ui5_view_builder text TYPE string DEFAULT `Save`.\n',
      '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    DATA(page) = view->ele( n = `View` ns = `mvc`\n'
      + '        )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n'
      + '    page->ele( `List` )->a( n = `growingThreshold` v = 20 ).\n    add_button( io_page = page ).\n    add_button( io_page = page text = `Cancel` ).\n'
      + '    client->view_display( view->stringify( ) ).\n',
      '  METHOD add_button.\n    io_page->tag( `Button` )->a( n = `text` v = text ).\n  ENDMETHOD.\n');
    const docs = prepareAbap(src).docs.join('');
    assert(docs.includes('growingThreshold="20"'), `a numeric literal is a value, not a name (${docs})`);
    assert(docs.includes('<Button text="Save"/>') && docs.includes('<Button text="Cancel"/>'),
      `the omitting call passes the DEFAULT, the other its own value (${docs})`);
  });
}
