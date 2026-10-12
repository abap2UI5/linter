/*
 * rows-hidden-by-visible: a bound aggregation filtered on the client by a
 * binding-valued `visible` on its row template, in a class that never raises
 * the model's size limit. See test/review/README.md for the harness.
 *
 * samples-controls app 000 (the overview) bound 622 rows and hid most of them
 * behind three default-on "Hide …" checkboxes. A JSONModel hands a bound
 * aggregation at most 100 entries and the hidden rows are among them, so the
 * table showed a few dozen ports under a title that said 622 - and no gate
 * said a word. The general "seeded past 100 rows" rule was dropped in 0.3 for
 * noise; this shape measured one hit on six corpora, the real one.
 */
export default async function ({ section, assert, f, checkAbapSource, checkXmlSource }) {
  const fs = await import('node:fs');
  const opts = { render: false, minUi5: '1.71' };
  const of = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'rows-hidden-by-visible');
  const fixture = fs.readFileSync(f('rowsvisible.clas.abap'), 'utf8');

  section('rows-hidden-by-visible: the fixture', () => {
    const hits = of(fixture);
    assert(hits.length === 1 && hits[0].member === 'items' && hits[0].severity === 'warning',
      `rows-hidden-by-visible: the hiding template is reported once, as a warning (got ${hits.length})`);
    assert(/at most 100/.test(hits[0].message) && /set_size_limit/.test(hits[0].message),
      'rows-hidden-by-visible: the message names the limit and the repair');
    assert(checkAbapSource(fixture, opts).findings.length === 1, 'the fixture carries no other finding');
  });

  section('rows-hidden-by-visible: what raises the limit, and what does not', () => {
    const display = '    client->view_display( page->stringify( ) ).\n';
    const raise = (wire) => fixture.replace(display, display + wire);
    assert(of(raise('    client->follow_up_action( val   = client->cs_event-set_size_limit\n'
      + '                              t_arg = VALUE #( ( `1000` ) ( client->cs_view-main ) ) ).\n')).length === 0,
    'cs_event-set_size_limit through the instance: raised, silent');
    assert(of(raise('    client->follow_up_action( val   = z2ui5_if_client=>cs_event-set_size_limit\n'
      + '                              t_arg = VALUE #( ( `1000` ) ( `MAIN` ) ) ).\n')).length === 0,
    'cs_event-set_size_limit through the interface: raised, silent');
    assert(of(raise('    client->follow_up_action( val = `SET_SIZE_LIMIT` t_arg = VALUE #( ( `1000` ) ( `MAIN` ) ) ).\n')).length === 0,
      'the action name as a literal: raised, silent');
    assert(of(fixture.replace('see cs_event-set_size_limit in the guide', 'nothing')).length === 1,
      'the prose literal was never what kept it silent');
  });

  /* Which aggregations the 100 is a defect on. The JSONModel caps a list
   * binding only where the control asks for no length (ClientListBinding:
   * `iLength || min(length, iSizeLimit)`); ManagedObject passes the binding
   * info's own `length`, a growing ListBase pages through GrowingEnablement
   * with explicit lengths. And it is a defect only where the aggregation is
   * a list of DATA ROWS: samples app 078 and popups sample 19 hide MultiInput
   * tokens, a value set nobody fills past 100, and were reported. */
  section('rows-hidden-by-visible: only a non-growing list\'s rows', () => {
    const list = fixture.slice(fixture.indexOf('    page->ele( `List`'), fixture.indexOf('    " no visible binding'));
    const swap = (by) => fixture.replace(list, by);
    const tokens = '    page->ele( `MultiInput`\n'
      + '        )->a( n = `tokens` v = client->_bind( t_rows )\n'
      + '        )->ele( `tokens`\n'
      + '            )->tag( `Token`\n'
      + '                )->a( n = `text`    v = `{NAME}`\n'
      + '                )->a( n = `visible` v = |\\{= !(${ client->_bind( hide ) } && $\\{HIDDEN\\}) \\}| ).\n\n';
    assert(of(swap(tokens)).length === 0, 'MultiInput tokens: a value set, not data rows - silent (samples 078, popups 19)');
    const flex = tokens.replace('`MultiInput`', '`VBox`').replace(/tokens/g, 'items').replace('`Token`', '`Text`');
    assert(of(swap(flex)).length === 0, 'a layout container\'s repeated items: not a list of rows - silent');
    const table = '    page->ele( `Table`\n'
      + '        )->a( n = `items` v = client->_bind( t_rows )\n'
      + '        )->ele( `columns`\n'
      + '            )->ele( `Column`\n'
      + '                )->tag( `Text`\n'
      + '                    )->a( n = `text` v = `Name`\n'
      + '            )->end(\n'
      + '        )->end(\n'
      + '        )->ele( `items`\n'
      + '            )->ele( `ColumnListItem`\n'
      + '                )->a( n = `visible` v = |\\{= !(${ client->_bind( hide ) } && $\\{HIDDEN\\}) \\}|\n'
      + '                )->ele( `cells`\n'
      + '                    )->tag( `Text` )->a( n = `text` v = `{NAME}` ).\n\n';
    const tableHits = of(swap(table));
    assert(tableHits.length === 1 && tableHits[0].control === 'sap.m.Table',
      `a responsive Table's items (samples-controls app 000's shape): reported (got ${tableHits.length})`);
    const growing = (v) => swap(list.replace(')->a( n = `items` v = client->_bind( t_rows )', `)->a( n = \`items\` v = client->_bind( t_rows )\n        )->a( n = \`growing\` ${v}`));
    assert(of(growing('b = abap_true')).length === 0, 'growing="true": GrowingEnablement asks for its own length, the limit does not apply - silent');
    assert(of(growing('v = `{/GROWING}`')).length === 0, 'a bound growing: a runtime matter - silent');
    assert(of(growing('b = abap_false')).length === 1, 'growing="false" is the default - reported');
    const length = swap(list.replace('v = client->_bind( t_rows )', 'v = `{ path: \'/T_ROWS\', length: 1000 }`'));
    assert(of(length).length === 0, 'a binding info with its own length: ManagedObject passes it, the limit does not apply - silent');
  });

  section('rows-hidden-by-visible: a raw view has no class to ask', () => {
    const xml = '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><List items="{/T_ROWS}"><items>'
      + '<StandardListItem title="{NAME}" visible="{= !${HIDDEN} }"/></items></List></mvc:View>';
    assert(!checkXmlSource(xml, opts).findings.some((x) => x.type === 'rows-hidden-by-visible'),
      'raw XML: not judged - whether the limit is raised is a fact about the class');
  });

  /* bound-aggregation-over-size-limit: the general rule dropped in 0.3,
   * back as an opt-in. Off unless asked; asked, it reports a list bound to a
   * table the class is SEEN to seed past 100 rows - the one literal seed, or
   * the APPENDs of literal DO loops - and nothing whose count it cannot
   * decide. */
  const RULE = 'bound-aggregation-over-size-limit';
  const on = { ...opts, rules: { [RULE]: 'warning' } };
  const over = fs.readFileSync(f('overlimit.clas.abap'), 'utf8');
  const hitsOf = (src, o = on) => checkAbapSource(src, o).findings.filter((x) => x.type === RULE);
  const doLoop = '      DO 400 TIMES.\n        APPEND VALUE #( name = |row { sy-index }| ) TO t_rows.\n      ENDDO.\n';
  const withLoop = (by) => over.replace(doLoop, by);

  section('bound-aggregation-over-size-limit: opt-in, and the fixture', () => {
    assert(hitsOf(over, opts).length === 0, 'not asked for: silent');
    const hits = hitsOf(over);
    assert(hits.length === 1 && hits[0].member === 'items' && hits[0].severity === 'warning',
      `asked for: the list is reported once, as a warning (got ${hits.length})`);
    assert(/at least 400 rows/.test(hits[0].message) && /set_size_limit/.test(hits[0].message),
      'the message names the count and the repair');
    assert(checkAbapSource(over, on).findings.filter((x) => x.type !== RULE).length === 0,
      'the fixture carries no other finding');
  });

  section('bound-aggregation-over-size-limit: what the count is read from', () => {
    const rows = (n) => Array.from({ length: n }, (_, i) => `( name = \`r${i}\` )`).join(' ');
    const seed = (n) => `      t_rows = VALUE #( ${rows(n)} ).\n`;
    assert(hitsOf(withLoop(seed(101))).length === 1 && /at least 101 rows/.test(hitsOf(withLoop(seed(101)))[0].message),
      'a literal seed of 101 rows: reported with its count');
    assert(hitsOf(withLoop(seed(100))).length === 0, 'a literal seed of 100 rows: within the limit, silent');
    assert(hitsOf(withLoop(seed(101) + seed(101))).length === 0, 'two seeds: which one is shown is a runtime matter, silent');
    const nested = '      DO 20 TIMES.\n        DO 10 TIMES.\n          APPEND INITIAL LINE TO t_rows.\n        ENDDO.\n      ENDDO.\n';
    assert(/at least 200 rows/.test(hitsOf(withLoop(nested))[0]?.message ?? ''), 'nested literal DOs multiply');
    assert(hitsOf(withLoop('      DO 400 TIMES.\n        INSERT VALUE #( ) INTO TABLE t_rows.\n      ENDDO.\n')).length === 1,
      'INSERT … INTO TABLE counts like APPEND');
    assert(hitsOf(withLoop('      DO 50 TIMES.\n        APPEND INITIAL LINE TO t_rows.\n      ENDDO.\n')).length === 0,
      'a loop of 50: silent');
  });

  section('bound-aggregation-over-size-limit: an undecided count is not a large one', () => {
    for (const [after, why] of [
      ['      DELETE t_rows WHERE name IS INITIAL.\n', 'DELETE … WHERE'],
      ['      CLEAR t_rows.\n', 'CLEAR'],
      ['      t_rows = t_other.\n', 'a reassignment'],
      ['      SELECT * FROM ztab INTO TABLE @t_rows.\n', 'SELECT … INTO TABLE'],
      ['      fill( CHANGING ct = t_rows ).\n', 'handed to a method'],
    ]) {
      assert(hitsOf(withLoop(doLoop + after)).length === 0, `${why}: the count is undecided, silent`);
    }
    for (const [wrap, why] of [
      [(b) => `      IF lv_flag = abap_true.\n${b}      ENDIF.\n`, 'under an IF'],
      [(b) => `      LOOP AT t_other INTO DATA(ls).\n${b}      ENDLOOP.\n`, 'inside a LOOP'],
      [(b) => `      DO lv_n TIMES.\n${b}      ENDDO.\n`, 'a DO whose count is not a literal'],
      [(b) => `      TRY.\n${b}      CATCH cx_root.\n      ENDTRY.\n`, 'inside a TRY'],
    ]) {
      assert(hitsOf(withLoop(wrap(doLoop))).length === 0, `the APPEND ${why}: not counted`);
    }
    const notInit = over.replace('IF client->check_on_navigated( ).', 'IF NOT client->check_on_navigated( ).');
    assert(hitsOf(notInit).length === 0, 'IF NOT check_on_navigated( ): a condition, not the start path');
  });

  section('bound-aggregation-over-size-limit: where the 100 applies', () => {
    const raised = over.replace('      client->view_display( page->stringify( ) ).\n',
      '      client->view_display( page->stringify( ) ).\n'
      + '      client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( `1000` ) ( `MAIN` ) ) ).\n');
    assert(hitsOf(raised).length === 0, 'the class raises the limit: silent');
    const growing = over.replace("page->ele( `List`\n", "page->ele( `List`\n          )->a( n = `growing` v = `true`\n");
    assert(hitsOf(growing).length === 0, 'a growing list pages: silent');
    const length = over.replace('v = client->_bind( t_rows )', 'v = `{ path: \'/T_ROWS\', length: 1000 }`');
    assert(hitsOf(length).length === 0, 'a binding info with a length: silent');
    const select = over.replace('page->ele( `List`', 'page->ele( `Select`').replace('tag( `StandardListItem`', 'tag( `core:Item`')
      .replace('n = `title` v = `{NAME}`', 'n = `text` v = `{NAME}`')
      .replace("          )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n",
        "          )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n          )->a( n = `xmlns:core` v = `sap.ui.core`\n");
    assert(hitsOf(select).length === 1, 'a Select binds its whole value list: reported');
    const vbox = over.replace('page->ele( `List`', 'page->ele( `VBox`').replace('tag( `StandardListItem`', 'tag( `Text`')
      .replace('n = `title` v = `{NAME}`', 'n = `text` v = `{NAME}`');
    assert(hitsOf(vbox).length === 0, 'a layout container\'s repeated items: not a list, silent');
  });
}
