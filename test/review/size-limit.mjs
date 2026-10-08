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

  section('rows-hidden-by-visible: a raw view has no class to ask', () => {
    const xml = '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><List items="{/T_ROWS}"><items>'
      + '<StandardListItem title="{NAME}" visible="{= !${HIDDEN} }"/></items></List></mvc:View>';
    assert(!checkXmlSource(xml, opts).findings.some((x) => x.type === 'rows-hidden-by-visible'),
      'raw XML: not judged - whether the limit is raised is a fact about the class');
  });
}
