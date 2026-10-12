/*
 * Review round 2026-10-12 - the ABAP-side rules, nine items:
 *
 *   1. unescaped-brace-in-style / collapsed-brace-in-style read only a bare
 *      `<style>`; a `<style type="text/css">` sheet was invisible to both.
 *   2. hardcoded-binding-path fired on `\{/* brand *\/` inside an escaped
 *      <style> value - the documented exemption had gone out of judge( ).
 *   3. redundant-serializable --fix ran on the scrubbed copy and deleted
 *      `INTERFACES if_serializable_object. " keep: …` comment included.
 *   4. moveDeclarationFix inserted at the NEXT section header's line, below
 *      the blank line that closes the target section - the moved declaration
 *      stood detached from its siblings.
 *   5. two boolean type lists (BOOL_TYPE / BOOLEAN_TYPES): `boole_d` and
 *      `xsdboolean` were booleans to omit-initial-drops-false and to nothing
 *      else.
 *   6. duplicate-for-iterator compared `i` and `I` as two names.
 *   7. binding-to-local never saw `_bind( ls_local-field )`.
 *   8. four rules rewrote under --fix without being listed in FIXABLE - and
 *      nothing gated that direction.
 *   9. the per-field RegExp rescans (frontend-wires literalsOf, guide-rules
 *      omit-initial, lifecycle manual-init-flag) - behaviour kept.
 *
 * See test/review/README.md for the harness.
 */
import { applyFixes, FIXABLE } from '../../lib/fix.mjs';
import { RULE_DOCS } from '../../lib/rule-docs.mjs';
import { BOOLEAN_TYPES } from '../../lib/guide-rules.mjs';

/* A complete app class - the shape the probes of this round were written in.
 * `pub` lands in the PUBLIC SECTION after `DATA name`, `prot` is the whole
 * PROTECTED SECTION (the client handle and the display helper by default),
 * `priv` follows it, `main` goes into main( ) after the lifecycle branch,
 * `locals` open view_display( ), `chain` sits in the Page's content before
 * an Input bound to `name`, `methods` after view_display( ). `core` adds
 * the sap.ui.core namespace a core:HTML tag needs. */
const app = ({
  pub = '', prot = '  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n    METHODS view_display.\n',
  priv = '', main = '', locals = '', chain = '', methods = '', core = false,
} = {}) =>
  'CLASS zcl_round_rules DEFINITION PUBLIC.\n\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA name TYPE string.\n'
  + pub + '\n' + prot + priv + '\nENDCLASS.\n\n\nCLASS zcl_round_rules IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + '    me->client = client.\n    IF client->check_on_navigated( ).\n      view_display( ).\n    ENDIF.\n'
  + main + '\n  ENDMETHOD.\n\n\n  METHOD view_display.\n\n' + locals
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`      v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`\n'
  + (core ? '        )->a( n = `xmlns:core` v = `sap.ui.core`\n' : '')
  + '\n        )->ele( `Page`\n            )->a( n = `title` v = `Fixture`\n\n            )->ele( `content`\n'
  + chain
  + '                )->tag( `Input`\n                    )->a( n = `value` v = client->_bind( name )\n\n'
  + '            )->end(\n        )->end( ).\n\n    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n'
  + methods + '\nENDCLASS.\n';

const html = (content) => `                )->tag( n = \`HTML\` ns = \`core\`\n                    )->a( n = \`content\` v = ${content}\n`;

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, properties: true, minUi5: '1.71' };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const fixed = (src, type = null) => applyFixes(src, judge(src).filter((x) => x.fixes?.length && (!type || x.type === type))).output;

  section('round 2026-10-12: the frame these sections ask in is clean', () => {
    const noise = judge(app()).map((x) => x.type);
    assert(noise.length === 0, `the frame reports nothing on its own (${noise.join(', ') || 'none'})`);
  });

  section('round 2026-10-12: the brace rules read a <style> tag with attributes, in any case', () => {
    // the old failure: both rules matched the literal `<style>` and nothing else,
    // so a sheet opened with `<style type="text/css">` was never judged
    const typed = app({ core: true, chain: html('`<style type="text/css">.myBox { color: red; }</style>`') });
    const un = of(typed, 'unescaped-brace-in-style');
    assert(un.length === 1 && un[0].fixes?.length === 2, `a typed <style> in a backtick literal is reported with both braces fixed (${un.length})`);
    assert(fixed(typed, 'unescaped-brace-in-style').includes('.myBox \\{ color: red; \\}'), 'the fix escapes the braces of the typed sheet');
    assert(of(typed, 'collapsed-brace-in-style').length === 0, 'a backtick literal is not the collapsed form');

    const collapsed = app({ core: true, chain: html('|<style type="text/css">.myBox \\{ color: red; \\}</style>|') });
    const co = of(collapsed, 'collapsed-brace-in-style');
    assert(co.length === 1 && co[0].fixes?.length === 2, `a typed <style> in a |…| template is reported as collapsed (${co.length})`);
    assert(fixed(collapsed, 'collapsed-brace-in-style').includes('.myBox \\\\\\{ color: red; \\\\\\}'), 'the fix doubles the backslashes in the template');
    assert(of(collapsed, 'unescaped-brace-in-style').length === 0, 'a template with escaped braces is not the unescaped form');

    const upper = app({ core: true, chain: html('`<STYLE>.a { }</STYLE>`') });
    assert(of(upper, 'unescaped-brace-in-style').length === 1, 'an upper-case <STYLE> … </STYLE> bounds the sheet too');

    const open = app({ core: true, chain: html('`<style type="text/css">.a { }`') });
    assert(of(open, 'unescaped-brace-in-style').length === 0, 'a sheet with no closing tag in sight is still not bounded, and not judged');
  });

  section('round 2026-10-12: hardcoded-binding-path stands down inside a <style> value and on an escaped brace', () => {
    // the old failure: `\{/* brand */` in a core:HTML content was a path
    const sheet = app({ core: true, chain: html('`<style>.myBox \\{/* brand */ color: red; \\}</style>`') });
    assert(of(sheet, 'hardcoded-binding-path').length === 0, 'a CSS comment after an escaped brace inside a <style> value is not a path');
    const escaped = app({ chain: '                )->tag( `Text`\n                    )->a( n = `text` v = `see \\{/x}`\n' });
    assert(of(escaped, 'hardcoded-binding-path').length === 0, 'an escaped `\\{/` outside a stylesheet is no binding either');
    // the exemption is narrow: the same characters unescaped are a path
    const path = app({ chain: '                )->tag( `Text`\n                    )->a( n = `text` v = `{/NAME}`\n' });
    const hit = of(path, 'hardcoded-binding-path');
    assert(hit.length === 1 && hit[0].value === '{/NAME}' && hit[0].fixes?.length === 1, `an unescaped absolute path is still reported, with its fix (${hit.length})`);
    assert(fixed(path, 'hardcoded-binding-path').includes('v = client->_bind( name )'), 'and rewritten to the derived binding');
  });

  section('round 2026-10-12: redundant-serializable keeps a line that carries a comment', () => {
    // the old failure: the `[ \t]*` before the line break matched the comment
    // blanked in the scrubbed copy, and --fix deleted comment and all
    const kept = app({ pub: '    INTERFACES if_serializable_object. " keep: the draft needs it\n' });
    const k = of(kept, 'redundant-serializable');
    assert(k.length === 1 && !k[0].fixes, `the commented line is reported without a fix (${k.length}, fixes: ${JSON.stringify(k[0]?.fixes ?? null)})`);
    assert(fixed(kept).includes('    INTERFACES if_serializable_object. " keep: the draft needs it\n'), '--fix leaves the line, comment included');
    const plain = app({ pub: '    INTERFACES if_serializable_object.\n' });
    const p = of(plain, 'redundant-serializable');
    assert(p.length === 1 && p[0].fixes?.length === 1, `the bare line keeps its fix (${p.length})`);
    const out = fixed(plain, 'redundant-serializable');
    assert(!/if_serializable_object/i.test(out) && /INTERFACES z2ui5_if_app\.\n    DATA name TYPE string\./.test(out), 'the bare line is deleted whole, its neighbours untouched');
    assert(of(out, 'redundant-serializable').length === 0, 'and the fixed class is silent');
  });

  section('round 2026-10-12: a moved declaration lands directly under the target section\'s last line', () => {
    // the old failure: the insertion point was the line start of the NEXT
    // section header, i.e. below the blank line closing the target section
    const bound = app({
      prot: '  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n    DATA mv_secret TYPE string.\n    METHODS view_display.\n',
      chain: '                )->tag( `Input`\n                    )->a( n = `value` v = client->_bind( mv_secret )\n',
    });
    const np = of(bound, 'binding-to-nonpublic');
    assert(np.length === 1 && np[0].fixes?.length === 2, `binding-to-nonpublic, with the two-span move (${np.length})`);
    const moved = fixed(bound, 'binding-to-nonpublic');
    assert(moved.includes('    DATA name TYPE string.\n    DATA mv_secret TYPE string.\n\n  PROTECTED SECTION.\n'),
      'the declaration is appended under `DATA name`, and the blank line still closes the PUBLIC SECTION');
    assert(!moved.includes('\n\n    DATA mv_secret'), 'it is not detached below the blank line');
    assert(moved.includes('    DATA client TYPE REF TO z2ui5_if_client.\n    METHODS view_display.\n'), 'the PROTECTED SECTION closes up around the gap');
    assert(of(moved, 'binding-to-nonpublic').length === 0, 'the fixed class is silent');

    const priv = app({ priv: '\n  PRIVATE SECTION.\n    DATA mv_hidden TYPE string.\n', main: '    mv_hidden = `x`.\n' });
    const pa = of(priv, 'private-app-attribute');
    assert(pa.length === 1 && pa[0].fixes?.length === 2, `private-app-attribute moves into the PROTECTED SECTION present (${pa.length})`);
    const widened = fixed(priv, 'private-app-attribute');
    assert(widened.includes('    METHODS view_display.\n    DATA mv_hidden TYPE string.\n\n  PRIVATE SECTION.\n'),
      'appended under the PROTECTED SECTION\'s last declaration, the gap before PRIVATE kept');

    const empty = app({ prot: '  PROTECTED SECTION.\n\n', priv: '  PRIVATE SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n    METHODS view_display.\n    DATA mv_hidden TYPE string.\n' });
    const intoEmpty = fixed(empty, 'private-app-attribute');
    assert(intoEmpty.includes('  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n'), 'an empty target section takes the line directly under its header');
  });

  section('round 2026-10-12: one boolean type list - boole_d and xsdboolean are booleans to every rule', () => {
    // the old failure: abap-rules.mjs's BOOL_TYPE lacked boole_d and xsdboolean,
    // so a `visible = mv_flag` with a boole_d flag was not an unconverted boolean
    for (const t of ['boole_d', 'xsdboolean']) assert(new RegExp(`\\b${t}\\b`).test(BOOLEAN_TYPES), `${t} is in the shared list`);
    const flags = app({
      pub: '    DATA mv_flag TYPE boole_d.\n    DATA mv_xsd TYPE xsdboolean.\n',
      chain: '                )->tag( `Button`\n                    )->a( n = `visible` v = mv_flag\n                    )->a( n = `enabled` v = mv_xsd\n',
    });
    const un = of(flags, 'unconverted-abap-boolean').map((x) => x.value).sort();
    assert(un.join() === 'mv_flag,mv_xsd', `both flags are unconverted booleans (${un.join(', ') || 'none'})`);

    const init = app({
      pub: '    DATA mv_started TYPE boole_d.\n',
      main: '    IF mv_started = abap_false.\n      mv_started = abap_true.\n      view_display( ).\n    ENDIF.\n',
    });
    assert(of(init, 'manual-init-flag').length === 1, 'a boole_d init flag is a manual-init-flag');

    const initial = app({ pub: '    DATA mv_flag TYPE xsdboolean.\n', main: '    IF mv_flag IS INITIAL.\n      name = `x`.\n    ENDIF.\n' });
    const li = of(initial, 'lifecycle-is-initial');
    assert(li.length === 1 && li[0].member === 'mv_flag' && li[0].fixes?.length === 1, `an xsdboolean asked IS INITIAL is reported with its fix (${li.length})`);
  });

  section('round 2026-10-12: duplicate-for-iterator folds case', () => {
    // the old failure: `FOR i` and `FOR I` were two names, and the downport's
    // two `DATA i TYPE i` collided unreported
    const twice = app({
      locals: '    DATA(lt_a) = VALUE string_table( FOR i = 1 UNTIL i > 2 ( `x` ) ).\n'
        + '    DATA(lt_b) = VALUE string_table( FOR I = 1 UNTIL I > 2 ( `y` ) ).\n',
    });
    const d = of(twice, 'duplicate-for-iterator');
    assert(d.length === 1 && d[0].member === 'I', `one finding, the member as written (${d.map((x) => x.member).join(', ') || 'none'})`);
    const distinct = twice.replace('FOR I = 1 UNTIL I > 2', 'FOR j = 1 UNTIL j > 2');
    assert(of(distinct, 'duplicate-for-iterator').length === 0, 'two different names are two iterators');
  });

  section('round 2026-10-12: binding-to-local judges the root of a component path', () => {
    // the old failure: the name had to end at a blank or `)`, so `ls_local-field`
    // matched nothing and the binding to a method-local structure passed
    const local = app({
      pub: '    TYPES: BEGIN OF ty_s,\n             field TYPE string,\n           END OF ty_s.\n',
      locals: '    DATA ls_local TYPE ty_s.\n    DATA lv_plain TYPE string.\n',
      chain: '                )->tag( `Input`\n                    )->a( n = `value` v = client->_bind( ls_local-field )\n'
        + '                )->tag( `Input`\n                    )->a( n = `value` v = client->_bind( val = lv_plain )\n'
        + '                )->tag( `Input`\n                    )->a( n = `value` v = client->_bind( me->name )\n',
    });
    const b = of(local, 'binding-to-local').map((x) => x.member).sort();
    assert(b.join() === 'ls_local,lv_plain', `the structure's root and the plain local, not the me-> attribute (${b.join(', ') || 'none'})`);

    // the widening stops where the old scan stopped too: a REFERENCE into the
    // table's rows, and the framework's cell binding `tab = … tab_index = …`,
    // whose path comes from the table (abap2UI5 node/srv zcl_tst_sub_a/b)
    const cells = app({
      pub: '    TYPES: BEGIN OF ty_row,\n             visible TYPE abap_bool,\n           END OF ty_row.\n    DATA mt_layout TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n',
      locals: '    DATA lv_index TYPE i.\n',
      chain: '                )->ele( `Table` )->a( n = `items` v = client->_bind( mt_layout )\n'
        + '                    )->ele( `columns`\n'
        + '                    )->end(\n'
        + '                )->end(\n',
      methods: '\n  METHOD cells.\n'
        + '    LOOP AT mt_layout REFERENCE INTO DATA(layout).\n'
        + '      lv_index = sy-tabix.\n'
        + '      view->a( n = `visible` v = client->_bind( val = layout->visible tab = mt_layout tab_index = lv_index ) ).\n'
        + '      view->a( n = `enabled` v = client->_bind( layout->visible ) ).\n'
        + '    ENDLOOP.\n'
        + '    LOOP AT mt_layout INTO DATA(row).\n'
        + '      view->a( n = `visible` v = client->_bind( val = row-visible tab = mt_layout tab_index = sy-tabix ) ).\n'
        + '    ENDLOOP.\n'
        + '  ENDMETHOD.\n',
    });
    assert(of(cells, 'binding-to-local').length === 0, `a reference dereference and a cell binding through tab = are not locals (${of(cells, 'binding-to-local').map((x) => x.member).join(', ') || 'none'})`);
  });

  section('round 2026-10-12: every rule that rewrites under --fix is listed in FIXABLE, and says so', () => {
    const late = ['unknown-view-slot', 'invalid-frontend-action', 'association-unknown-id', 'unknown-source-property'];
    for (const id of late) assert(FIXABLE.includes(id) && RULE_DOCS[id].fixNote, `${id} is fixable and documents its fix`);

    /* The reverse of run.mjs's "FIXABLE ⊆ documented": every finding type
     * observed WITH a fix has to be in FIXABLE. Observed over the cards'
     * examples and remedies (the full pipeline, so the fixes findings.mjs
     * attaches afterwards count) and over the four shapes that were missing. */
    const wires = app({
      main: '    IF client->check_on_event( `GO` ).\n'
        + '      client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `in1` ) ( `focus` ) ) view = `main` ).\n'
        + '      client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `in1` ) ( `items` ) ( `filter` ) ( `[[["NAME","contains","x"]]]` ) ) ).\n'
        + '    ENDIF.\n',
      chain: '                )->tag( `Input`\n                    )->a( n = `id` v = `in1`\n                    )->a( n = `value` v = client->_bind( name )\n'
        + '                )->tag( `Button`\n                    )->a( n = `press` v = client->_event( `GO` )\n',
    });
    const assoc = app({ chain: '                )->tag( `Label`\n                    )->a( n = `text` v = `Name`\n                    )->a( n = `labelFor` v = `nameInput`\n'
      + '                )->tag( `Input`\n                    )->a( n = `id` v = `name_input`\n                    )->a( n = `value` v = client->_bind( name )\n' });
    const source = app({
      main: '    IF client->check_on_event( `GO` ).\n      name = client->get_event_arg( ).\n    ENDIF.\n',
      chain: '                )->tag( `Button`\n                    )->a( n = `text` v = `Go`\n'
        + '                    )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( `${$source>/Text}` ) ( `x` ) ) )\n',
    });
    const withFix = new Map();
    const observe = (src) => {
      let found;
      try { found = judge(src); } catch { return; }   // a snippet the parser cannot take alone is not this gate's business
      for (const x of found) if (x.fixes?.length) withFix.set(x.type, (withFix.get(x.type) ?? 0) + 1);
    };
    for (const id of Object.keys(RULE_DOCS)) for (const half of ['example', 'remedy']) observe(RULE_DOCS[id][half].replace(/\n?$/, '\n'));
    for (const src of [wires, assoc, source]) observe(src);
    for (const id of late) assert(withFix.has(id), `${id} was observed with a fix, so the gate below sees it`);
    const unlisted = [...withFix.keys()].filter((t) => !FIXABLE.includes(t));
    assert(unlisted.length === 0, `every finding type observed with a fix is in FIXABLE (unlisted: ${unlisted.join(', ') || 'none'})`);

    // and the four fixes do what their notes say
    const w = fixed(wires);
    assert(w.includes('view = `MAIN`') && w.includes('"NAME","Contains","x"'), 'the slot and the filter operator are rewritten in place');
    assert(fixed(assoc, 'association-unknown-id').includes('v = `name_input`'), 'the association names the real id');
    assert(fixed(source, 'unknown-source-property').includes('${$source>/text}'), 'the $source> segment is rewritten');
  });

  section('round 2026-10-12: the memoized scans decide as before', () => {
    // navigation-lost-on-rebuild (c): the field's literals name a page - read
    // once per field now, asked by every wire
    const nav = app({
      pub: '    DATA mv_page TYPE string VALUE `p2`.\n    DATA mv_other TYPE string VALUE `slide`.\n    METHODS on_event.\n',
      chain: '                )->ele( `NavContainer` )->a( n = `id` v = `nav` )->a( n = `initialPage` v = `p1`\n'
        + '                    )->tag( `Page` )->a( n = `id` v = `p1`\n'
        + '                    )->tag( `Page` )->a( n = `id` v = `p2`\n'
        + '                )->end(\n'
        + '                )->tag( `Select` )->a( n = `selectedKey` v = client->_bind( mv_page )\n'
        + '                )->tag( `Input` )->a( n = `value` v = client->_bind( mv_other )\n',
      main: '    IF client->check_on_event( `GO` ).\n      on_event( ).\n    ENDIF.\n',
      methods: '\n  METHOD on_event.\n'
        + '    client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `nav` ) ( `to` ) ( `p2` ) ) ).\n'
        + '    client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `nav` ) ( `toDetail` ) ( `p2` ) ) ).\n'
        + '  ENDMETHOD.\n',
    });
    const n = of(nav, 'navigation-lost-on-rebuild');
    assert(n.length >= 1 && n.every((x) => x.field === 'mv_page'), `the field holding a page id is found for each wire (${n.map((x) => `${x.member}:${x.field}`).join(', ') || 'none'})`);

    // omit-initial-drops-false: the boolean declaration is read once per class
    const list = (table) => `                )->ele( \`List\` )->a( n = \`items\` v = client->_bind( val = ${table} omit_initial = abap_true )\n`
      + '                    )->tag( `StandardListItem`\n'
      + '                        )->a( n = `title` v = `{TITLE}`\n'
      + '                        )->a( n = `visible` v = `{FLAG}`\n'
      + '                )->end(\n';
    const omit = app({
      pub: '    TYPES: BEGIN OF ty_row, title TYPE string, flag TYPE boole_d, END OF ty_row.\n'
        + '    DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n'
        + '    DATA t_more TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n',
      chain: list('t_rows') + list('t_more'),
    });
    const o = of(omit, 'omit-initial-drops-false').map((x) => `${x.value}-${x.member}`).sort();
    assert(o.join() === 't_more-FLAG,t_rows-FLAG', `the boole_d column is reported on both tables (${o.join(', ') || 'none'})`);

    // manual-init-flag: the `= abap_true` pattern is built once per flag
    const init = app({
      pub: '    DATA mv_a TYPE abap_bool.\n    DATA mv_b TYPE abap_bool.\n',
      main: '    IF mv_a = abap_false.\n      mv_a = abap_true.\n      view_display( ).\n    ENDIF.\n'
        + '    IF mv_b IS INITIAL.\n      view_display( ).\n    ENDIF.\n'
        + '    IF mv_a IS INITIAL.\n      mv_a = abap_true.\n      view_display( ).\n    ENDIF.\n',
    });
    // report( ) collapses the two mv_a findings into one; mv_b, left alone in its branch, is not one
    const m = of(init, 'manual-init-flag').map((x) => x.member);
    assert(m.join() === 'mv_a', `the flag set true in its branches is reported, the one left alone is not (${m.join(', ') || 'none'})`);
  });
}
