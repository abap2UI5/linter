/*
 * The 2026-09-25 round - five sentences of the app guide and of
 * z2ui5_if_client's ABAP Doc read as rules (lib/guide-rules.mjs):
 * frontend-action-as-backend-event, popup-display-xml,
 * queue-last-without-no-busy, nest-view-without-destroy and
 * omit-initial-drops-false. See test/review/README.md for the harness.
 */
import fs from 'node:fs';
import { applyFixes } from '../../lib/fix.mjs';

/* A complete app class around one main( ): `defs` lands in the PUBLIC
 * SECTION, `main` before the view is built, `attrs` on the view's Button,
 * `tail` after the view and before the display, `methods` after main( ). */
const frame = ({ defs = '', main = '', attrs = '', tail = '', methods = '' } = {}) =>
  'CLASS zcl_review_guide DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
  + defs
  + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_review_guide IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
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
  + '        )->end( ).\n\n'
  + tail
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\n'
  + methods
  + 'ENDCLASS.\n';

/* A List bound to a row type with one boolean, the boolean bound to `prop`
 * of the StandardListItem, the table bound with `bind` as its extra
 * argument(s) - the shape omit-initial-drops-false reads. */
const listFrame = ({ type = 'abap_bool', prop = 'visible', bind = 'omit_initial = abap_true' } = {}) => frame({
  defs: `    TYPES: BEGIN OF ty_row, title TYPE string, flag TYPE ${type}, END OF ty_row.\n`
    + '    DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n',
  attrs: `          )->ele( \`List\` )->a( n = \`items\` v = client->_bind( val = t_rows ${bind} )\n`
    + '            )->tag( `StandardListItem`\n'
    + '              )->a( n = `title` v = `{TITLE}`\n'
    + `              )->a( n = \`${prop}\` v = \`{FLAG}\`\n`
    + '          )->end( )\n',
});

const wire = (event, call) => frame({ attrs: `            )->a( n = \`${event}\` v = ${call}\n` });

export default async function ({ section, assert, f, checkAbapSource, checkFiles }) {
  const opts = { render: false, properties: true, minUi5: '1.120' };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const fixed = (src) => applyFixes(src, judge(src)).output;
  const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;
  const GUIDE_RULES = ['frontend-action-as-backend-event', 'popup-display-xml', 'queue-last-without-no-busy', 'nest-view-without-destroy', 'omit-initial-drops-false'];

  section('guide rules: the frame these sections ask in is clean', () => {
    const noise = judge(frame()).map((x) => x.type);
    assert(noise.length === 0, `the frame reports nothing on its own (${noise.join(', ') || 'none'})`);
  });

  section('guide rules: the fixture carries all five defects, each at its line, and the good fixtures none', async () => {
    const [result] = await checkFiles([f('guiderules.clas.abap')], { render: false });
    const src = fs.readFileSync(f('guiderules.clas.abap'), 'utf8');
    const at = (type) => result.findings.filter((x) => x.type === type).map((x) => x.line);
    assert(at('frontend-action-as-backend-event').join() === String(lineOf(src, 'client->_event( client->cs_event-popup_close )')),
      'frontend-action-as-backend-event sits on the _event( cs_event- ) wire');
    assert(at('popup-display-xml').join() === String(lineOf(src, 'popup_display( xml =')),
      'popup-display-xml sits on the popup_display( xml = ) call');
    assert(at('queue-last-without-no-busy').join() === String(lineOf(src, 'check_queue_last = abap_true )')),
      'queue-last-without-no-busy sits on the liveChange wire');
    assert(at('nest-view-without-destroy').join() === [lineOf(src, 'nest_view_display('), lineOf(src, 'nest2_view_display(')].join(),
      'nest-view-without-destroy reports both slots');
    assert(at('omit-initial-drops-false').join() === String(lineOf(src, 'omit_initial = abap_true')),
      'omit-initial-drops-false sits on the _bind( ) call');
    const other = result.findings.filter((x) => !GUIDE_RULES.includes(x.type)).map((x) => x.type);
    assert(other.length === 0, `the fixture is otherwise clean (${other.join(', ') || 'none'})`);

    const good = await checkFiles([f('good.clas.abap'), f('viewbuilder.clas.abap')], { render: false });
    const loud = good.flatMap((r) => r.findings).filter((x) => GUIDE_RULES.includes(x.type)).map((x) => x.type);
    assert(loud.length === 0, `the good fixtures raise none of the five (${loud.join(', ') || 'none'})`);

    // the fixes, applied to the fixture: four of the six findings carry one,
    // and a second pass finds only the two that cannot be fixed mechanically
    const out = applyFixes(src, result.findings).output;
    assert(out.includes('client->follow_up_action( val = client->cs_event-popup_close )'), 'the backend event becomes a follow_up_action with a named val');
    assert(out.includes('client->popup_display( val = popup->stringify( ) )'), 'xml = becomes val =');
    assert(out.includes('method_insert = `addContent` method_destroy = `removeAllContent` )'), 'addContent gets removeAllContent');
    assert(out.includes('method_insert = `addMidColumnPage` )'), 'an insert the ABAP Doc does not pair is left alone');
    assert(out.includes('s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true )'), 'check_no_busy joins check_queue_last');
    const again = judge(out).filter((x) => GUIDE_RULES.includes(x.type)).map((x) => `${x.type}:${x.member}`).sort();
    assert(again.join() === 'nest-view-without-destroy:nest2_view_display,omit-initial-drops-false:FLAG'.replace('FLAG', 'ENABLED'),
      `after --fix only the unfixable two remain (${again.join(', ')})`);
  });

  section('frontend-action-as-backend-event: every spelling of the constant, positional or named', () => {
    for (const call of [
      'client->_event( client->cs_event-popup_close )',
      'client->_event( val = client->cs_event-popup_close )',
      'client->_event( val = z2ui5_if_client=>cs_event-popup_close )',
      'client->_event( cs_event-popover_close )',
      'me->client->_event( val = me->client->cs_event-popup_close t_arg = VALUE #( ( `x` ) ) )',
    ]) {
      const found = of(wire('press', call), 'frontend-action-as-backend-event');
      assert(found.length === 1 && /^POP(UP|OVER)_CLOSE$/.test(found[0].member), `reported once, naming the constant: ${call}`);
      assert(found[0].fixes?.length >= 1, `carries a fix: ${call}`);
    }
    const positional = fixed(wire('press', 'client->_event( client->cs_event-popup_close )'));
    assert(positional.includes('v = client->follow_up_action( val = client->cs_event-popup_close )'), 'a positional constant is renamed AND named');
    const named = fixed(wire('press', 'client->_event( val = z2ui5_if_client=>cs_event-popup_close )'));
    assert(named.includes('v = client->follow_up_action( val = z2ui5_if_client=>cs_event-popup_close )'), 'a named one is only renamed');
    assert(of(named, 'frontend-action-as-backend-event').length === 0, 'the fixed wire is silent');
  });

  section('frontend-action-as-backend-event: a literal name, a variable and the frontend wires are not its business', () => {
    for (const call of [
      'client->_event( `POPUP_CLOSE` )',
      'client->_event( lv_event )',
      'client->follow_up_action( val = client->cs_event-popup_close )',
      'client->_event_client( val = client->cs_event-popup_close )',
      'client->_event( val = `CLOSE` t_arg = VALUE #( ( client->cs_event-popup_close ) ) )',
    ]) {
      assert(of(wire('press', call), 'frontend-action-as-backend-event').length === 0, `silent: ${call}`);
    }
  });

  section('popup-display-xml: the mirror of popover-display-val, with the same fix', () => {
    const src = frame({ tail: '    client->popup_display( xml = view->stringify( ) ).\n' });
    const found = of(src, 'popup-display-xml');
    assert(found.length === 1 && found[0].member === 'xml', 'reported once, on the parameter');
    assert(fixed(src).includes('client->popup_display( val = view->stringify( ) ).'), 'xml = becomes val =');
    assert(of(fixed(src), 'popup-display-xml').length === 0, 'the fixed call is silent');
    assert(of(frame({ tail: '    client->popup_display( val = view->stringify( ) ).\n' }), 'popup-display-xml').length === 0, 'val = is the right parameter');
    assert(of(frame({ tail: '    client->popover_display( xml = view->stringify( ) by_id = `mainPage` ).\n' }), 'popup-display-xml').length === 0, 'the popover takes xml');
  });

  section('queue-last-without-no-busy: only a live wire that queues and does not silence the overlay', () => {
    const queued = wire('liveChange', 'client->_event( val = `S` s_ctrl = VALUE #( check_queue_last = abap_true ) )');
    const found = of(queued, 'queue-last-without-no-busy');
    assert(found.length === 1 && found[0].member === 'liveChange', 'reported once, naming the event');
    assert(fixed(queued).includes('s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true )'), 'the fix appends check_no_busy');
    assert(of(fixed(queued), 'queue-last-without-no-busy').length === 0, 'the fixed wire is silent');

    const typed = wire('liveSearch', 'client->_event( val = `S` s_ctrl = VALUE z2ui5_if_client=>ty_s_event_control( prevent_default = abap_true check_queue_last = abap_true ) )');
    assert(of(typed, 'queue-last-without-no-busy').length === 1, 'a typed constructor with other fields is read too');
    assert(fixed(typed).includes('check_queue_last = abap_true check_no_busy = abap_true ) )'), 'the flag goes after the existing fields');

    for (const [event, call] of [
      ['liveChange', 'client->_event( val = `S` s_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true ) )'],
      ['liveChange', 'client->_event( val = `S` s_ctrl = VALUE #( check_no_busy = abap_true ) )'],
      ['liveChange', 'client->_event( `S` )'],
      ['liveChange', 'client->_event( val = `S` s_ctrl = ls_ctrl )'],
      ['change', 'client->_event( val = `S` s_ctrl = VALUE #( check_queue_last = abap_true ) )'],
      ['liveChange', 'client->follow_up_action( val = client->cs_event-popup_close t_arg = VALUE #( ( `x` ) ) )'],
    ]) {
      assert(of(wire(event, call), 'queue-last-without-no-busy').length === 0, `silent: ${event} = ${call}`);
    }
    // the wire it stands beside: live-event-roundtrip is silenced by the same
    // flag, so the two never report one wire together
    assert(of(queued, 'live-event-roundtrip').length === 0, 'live-event-roundtrip stands down on a queued wire');
  });

  section('nest-view-without-destroy: the documented pairs get a fix, everything else the finding', () => {
    const nest = (args) => frame({ tail: `    client->nest_view_display( ${args} ).\n` });
    for (const [insert, destroy] of [['addContent', 'removeAllContent'], ['addItem', 'removeAllItems'], ['addPage', 'removeAllPages'], ['ADDITEM', 'removeAllItems']]) {
      const src = nest(`val = view->stringify( ) id = \`mainPage\` method_insert = \`${insert}\``);
      const found = of(src, 'nest-view-without-destroy');
      assert(found.length === 1 && found[0].member === 'nest_view_display' && found[0].value === insert, `reported once: ${insert}`);
      assert(fixed(src).includes(`method_insert = \`${insert}\` method_destroy = \`${destroy}\` )`), `${insert} pairs with ${destroy}`);
      assert(of(fixed(src), 'nest-view-without-destroy').length === 0, `the fixed call is silent: ${insert}`);
    }
    const quoted = nest("val = view->stringify( ) id = 'mainPage' method_insert = 'addItem'");
    assert(fixed(quoted).includes("method_insert = 'addItem' method_destroy = 'removeAllItems' )"), 'the fix keeps the quote style of the insert');
    for (const args of [
      'val = view->stringify( ) id = `mainPage` method_insert = `addMidColumnPage`',
      'val = view->stringify( ) id = `mainPage` method_insert = lv_insert',
    ]) {
      const found = of(nest(args), 'nest-view-without-destroy');
      assert(found.length === 1 && !found[0].fixes, `reported without a fix: ${args}`);
    }
    assert(of(nest('val = view->stringify( ) id = `mainPage` method_insert = `addContent` method_destroy = `removeAllContent`'), 'nest-view-without-destroy').length === 0,
      'a call naming method_destroy is silent');
    assert(of(nest('val = view->stringify( ) id = `mainPage` method_destroy = `destroyContent` method_insert = `addContent`'), 'nest-view-without-destroy').length === 0,
      'in either order');
    const second = frame({ tail: '    client->nest2_view_display( val = view->stringify( ) id = `mainPage` method_insert = `addItem` ).\n' });
    const found = of(second, 'nest-view-without-destroy');
    assert(found.length === 1 && found[0].member === 'nest2_view_display', 'the second slot is judged by the same contract');
    assert(fixed(second).includes('method_insert = `addItem` method_destroy = `removeAllItems` )'), 'and fixed the same way');
  });

  section('omit-initial-drops-false: a bound boolean the control defaults to true, declared as one', () => {
    const found = of(listFrame(), 'omit-initial-drops-false');
    assert(found.length === 1 && found[0].member === 'FLAG' && found[0].value === 't_rows', 'reported once, naming the field and the table');
    assert(!found[0].fixes, 'no fix: which columns to list is the author\'s call');
    assert(of(listFrame({ bind: 'omit_initial = abap_true path = abap_false' }), 'omit-initial-drops-false').length === 1, 'the argument order does not matter');
    for (const [what, variant] of [
      ['no omit_initial', listFrame({ bind: '' })],
      ['omit_initial = abap_false', listFrame({ bind: 'omit_initial = abap_false' })],
      ['omit_initial_paths naming other columns', listFrame({ bind: 'omit_initial_paths = VALUE #( ( `TITLE` ) )' })],
      ['a property that defaults to false', listFrame({ prop: 'selected' })],
      ['a non-boolean property', listFrame({ prop: 'description' })],
      ['a component of a type the class does not spell as boolean', listFrame({ type: 'string' })],
    ]) {
      assert(of(variant, 'omit-initial-drops-false').length === 0, `silent: ${what}`);
    }
    // the same row, seeded inconsistently: the sibling rule stands down on
    // omit_initial (checkEnumRowLiterals returns early), this one speaks
    const seeded = listFrame().replace('  METHOD z2ui5_if_app~main.\n', '  METHOD z2ui5_if_app~main.\n    t_rows = VALUE #( ( title = `a` flag = abap_true ) ( title = `b` ) ).\n');
    assert(of(seeded, 'absent-boolean-overrides-default').length === 0 && of(seeded, 'omit-initial-drops-false').length === 1,
      'under omit_initial the seed rule is silent and this rule reports the drop');
  });
}
