/*
 * The framework's window state - `/__WINDOW/<table>/TOTAL`, `COUNT`, `SIZE`
 * - for a table bound with `client->window_bind_tab( )` (abap2UI5 1.149.0,
 * the name `_bind_tab( )` was released under). The frontend keeps it beside
 * the rows (`MODEL.__WINDOW.MT_ROWS`), the derived model did not, and the
 * documented `{/__WINDOW/MT_ROWS/TOTAL} rows` was an unknown-binding-path
 * (abap2UI5/docs, cookbook/model/windowed_tables.md). And `window_bind_tab(
 * )` itself was an unresolved expression: the table lost its `items`, and
 * its row template went unjudged.
 *
 * Fixture: test/fixtures/windowstate.clas.abap. See test/review/README.md.
 */
import fs from 'node:fs';
import { applyFixes } from '../../lib/fix.mjs';

export default async function ({ section, assert, f, checkAbapSource, prepareAbap }) {
  const opts = { render: false, properties: true };
  const SRC = fs.readFileSync(f('windowstate.clas.abap'), 'utf8');
  const hits = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'unknown-binding-path');
  const values = (src) => hits(src).map((x) => x.value).sort();

  section('unknown-binding-path: /__WINDOW/<table>/TOTAL|COUNT|SIZE of a windowed table is a path of the model', () => {
    assert(values(SRC).join() === '/__WINDOW/MT_PLAIN/TOTAL,/__WINDOW/MT_ROWS/ROWS,/__WINDOW/MT_ROWS/Total,NAEM',
      `TOTAL, COUNT and SIZE of MT_ROWS pass; a fourth name, a table that is not windowed and a misspelt row field do not (got ${values(SRC).join()})`);
    const plain = hits(SRC).find((x) => x.value === '/__WINDOW/MT_PLAIN/TOTAL');
    assert(/\{\/MT_PLAIN\} is not bound with window_bind_tab\( \)/.test(plain.message), `the message says why (got ${plain.message})`);
    const prep = prepareAbap(SRC);
    assert([...prep.windowed.paths].join() === '/MT_ROWS' && prep.windowed.open === false, 'the windowed tables are read off every window_bind_tab( ), the handler\'s included');
    assert(/<Table items="\{\/MT_ROWS\}"/.test(prep.docs[0]), 'window_bind_tab( ) binds the table like _bind( )');
  });

  section('unknown-binding-path: a misspelt window state name gets the did-you-mean fix', () => {
    const typo = hits(SRC).find((x) => x.value === '/__WINDOW/MT_ROWS/Total');
    assert(typo?.fixes?.length === 1 && typo.suggestion === 'TOTAL', 'Total -> TOTAL, up to letter case');
    const { output } = applyFixes(SRC, [typo]);
    assert(output.includes('}/TOTAL\\}|') && !output.includes('/Total'), 'the segment is rewritten in the template');
  });

  section('unknown-binding-path: the window state of a table whose path is not knowable is judged by its name only', () => {
    const ref = SRC.replace('client->window_bind_tab( val    = mt_rows\n                               window = 50',
      'client->window_bind_tab( val    = REF #( mt_rows )\n                               window = 50');
    assert(prepareAbap(ref).windowed.open === true, 'a REF #( ) hands over no path');
    assert(values(ref).join() === '/__WINDOW/MT_ROWS/ROWS,/__WINDOW/MT_ROWS/Total,NAEM',
      `the table is not judged, the state's name still is (got ${values(ref).join()})`);
    const legacy = SRC.replaceAll('window_bind_tab(', '_bind_tab(');
    assert(values(legacy).join() === values(SRC).join(), '_bind_tab( ), the pre-release spelling, reads the same');
    const none = SRC.replace(/ {6}client->window_bind_tab\( val {4}= mt_rows\n[^\n]*\n[^\n]*\n/, '      client->_bind( mt_rows ).\n');
    assert(values(none).includes('/__WINDOW/MT_PLAIN/TOTAL') && values(none).includes('/__WINDOW/MT_ROWS/ROWS'), 'the view\'s own window_bind_tab( ) is enough');
  });
}
