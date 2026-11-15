/*
 * The chain writer (lib/chain-write.mjs): a view tree as the builder chain
 * that builds it. Written 2026-11, when the three writers of the tools - the
 * playground's View editor, the layout editor's class generator, the VS Code
 * extension's XML converter - became this one.
 *
 * The corpus under test/fixtures/chain-write/ is what each of those writers
 * wrote on the day it was replaced: per tool a list of inputs with the chain
 * the tool's own code produced for them (the playground's from the classes
 * of abap2UI5 and samples-controls, the layout editor's from its starters
 * and its kitchen sink in both releases, the extension's from its test
 * views, this repository's *.view.xml fixtures and reconstructed
 * samples-controls views). Three claims are held over all of it:
 *
 *   1. the shared writer writes what the tool wrote - byte for byte, or the
 *      same calls with the same arguments where the tools disagreed and one
 *      layout was chosen (the normalisations are named below, per tool);
 *   2. every chain it writes passes `chain-house-layout` and its two
 *      neighbours;
 *   3. every chain reconstructs (lib/reconstruct.mjs) to the view it was
 *      written from.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MAX_LINE, STEP, abapLiteral, attributeLines, literalPieces, unwritable, writeChain } from '../../lib/chain-write.mjs';
import { STEP as CHECKED_STEP } from '../../lib/chain-layout.mjs';
import { parseXml } from '../../lib/properties.mjs';
import { toXml } from '../../lib/reconstruct.mjs';

const LAYOUT_RULES = ['chain-house-layout', 'chain-indentation', 'chain-element-per-line'];

/* A class around one view statement. `declared` for the 7.02 shape, where
 * the variable is declared at the top of the method. */
const frame = (chain, { declared = false } = {}) =>
  'CLASS zcl_chain_write DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
  + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_chain_write IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + (declared ? '    DATA view TYPE REF TO z2ui5_cl_ui5_view_builder.\n\n' : '')
  + chain + '\n\n    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\nENDCLASS.\n';

/* The calls of a chain without their layout: blank lines out, a literal cut
 * into `&&` pieces joined again, every run of blanks one blank. Two chains
 * that agree here make the same calls with the same arguments in the same
 * order - what is left to differ is where the lines break and how they are
 * indented, which is exactly what the tools disagreed about. */
const calls = (chain) => chain
  .split('\n').filter((line) => line.trim() !== '').join('\n')
  .replace(/`\n\s*&& `/g, '')
  .replace(/[ \n]+/g, ' ')
  .trim();

/* The VS Code extension's reading of a pasted view, as far as the fixture
 * needs it: its own forgiving XML parser stays in the extension, the linter's
 * reads the same well-formed documents. A handler reference becomes the
 * abap2UI5 event it is wired to - the one value the extension does not write
 * as a literal. */
const EVENT_ATTRS = new Set(['press', 'change', 'select', 'selectionchange', 'livechange', 'submit', 'search', 'confirm', 'cancel',
  'close', 'afterclose', 'beforeopen', 'afteropen', 'itempress', 'navbuttonpress', 'updatefinished', 'valuehelprequest',
  'selectionfinish', 'toggle']);
const HANDLER_VALUE = /^\.[A-Za-z_][\w.]*(?:\(\s*[^)]*\))?$/;
const eventNameFor = (value) => {
  const bare = value.replace(/^\./, '').replace(/\(.*\)$/, '');
  return (bare.split('.').filter(Boolean).pop() ?? bare).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
};
const asExtension = (node) => ({
  name: node.name,
  ns: node.ns,
  attrs: node.attrs.map(([name, value]) => (HANDLER_VALUE.test(value) || (EVENT_ATTRS.has(name.toLowerCase()) && /^[A-Za-z_]\w*$/.test(value))
    ? { name, raw: `client->_event( ${abapLiteral(eventNameFor(value))} )` }
    : { name, value: value.replace(/\r\n|[\r\n\t]/g, ' ') })),
  children: node.children.map(asExtension),
});

export default async function ({ section, assert, f, FIX, checkAbapSource, prepareAbap }) {
  const corpus = (tool) => JSON.parse(fs.readFileSync(f(`chain-write/${tool}.json`), 'utf8'));
  const judge = (source) => checkAbapSource(source, { render: false, rules: Object.fromEntries(LAYOUT_RULES.map((id) => [id, {}])) })
    .findings.filter((x) => LAYOUT_RULES.includes(x.type));
  const rebuilt = (source) => prepareAbap(source).docs;

  /* claims 2 and 3 for one written chain; `view` is the XML it has to build */
  const held = (id, chain, view, options) => {
    const source = frame(chain, options);
    const findings = judge(source);
    const docs = rebuilt(source);
    const long = chain.split('\n').filter((line) => line.length > MAX_LINE).length;
    return (findings.length ? [`${id}: ${findings[0].type} at line ${findings[0].line}`] : [])
      .concat(docs.length === 1 && docs[0] === view ? [] : [`${id}: reconstructs to another view`])
      .concat(/[ \t]$/m.test(chain) ? [`${id}: a line ends in a blank`] : [])
      .concat(long ? [`${id}: ${long} line(s) over ${MAX_LINE}`] : []);
  };
  const report = (failed) => failed.slice(0, 3).join('; ') || 'none';

  // ------------------------------------------------------------ the corpus

  section('chain-write: the playground\'s chains, byte for byte', () => {
    /* The tree of the View editor: every attribute the ABAP that stands right
     * of its `=`, a wrapped value with its line breaks. No normalisation -
     * the playground's writer was the one written to the skill's blank-line
     * rules, and the shared one took them over. */
    const entries = corpus('playground');
    const differs = [];
    const failed = [];
    for (const { id, indent, assignment, tree, expected } of entries) {
      const { text } = writeChain(tree, { indent, assignment });
      if (text !== expected) differs.push(id);
      failed.push(...held(id, text, rebuilt(frame(expected))[0]));
    }
    assert(entries.length >= 12 && differs.length === 0, `the ${entries.length} chains are the ones the playground wrote (differ: ${differs.join(', ') || 'none'})`);
    assert(failed.length === 0, `each passes the layout rules and reconstructs to the view the playground's chain built (${report(failed)})`);
  });

  section('chain-write: the layout editor\'s classes - the same calls, the skill\'s blank lines', () => {
    /* NORMALISED: the blank lines. The layout editor opened a blank in front
     * of every first `tag( )` (under a bare `ele( )` too) and in front of an
     * `ele( )` that follows a `tag( )`. The skill has exactly two blocks - the
     * content of a control that carries attributes, and a run of tags after
     * something that is not one - and its own example writes
     * `)->ele( \`items\`` with the `tag( )` directly under it. Everything else
     * - the columns, the `v =` alignment, the `&&` pieces hanging under the
     * first - is unchanged, which the comparison without blank lines holds. */
    const entries = corpus('layout-editor');
    const differs = [];
    const same = [];
    const failed = [];
    for (const { id, release, tree, expected } of entries) {
      const options = { indent: 4, assignment: release === '702' ? 'view = ' : 'DATA(view) = ' };
      const { text, lines, owners } = writeChain(tree, options);
      const noBlanks = (chain) => chain.split('\n').filter((line) => line !== '').join('\n');
      if (noBlanks(text) !== noBlanks(expected)) differs.push(id);
      if (text === expected) same.push(id);
      failed.push(...held(id, text, rebuilt(frame(expected, { declared: release === '702' }))[0], { declared: release === '702' }));
      // the code view links a line to its control: every line that is not
      // blank and not the factory line belongs to a node of the tree
      if (lines.some((line, i) => (i > 0 && line !== '') !== (owners[i] !== null))) failed.push(`${id}: a line without its owner`);
    }
    assert(entries.length >= 16 && differs.length === 0, `the ${entries.length} chains differ from the layout editor's in blank lines only (differ otherwise: ${differs.join(', ') || 'none'})`);
    assert(same.length > 0 && same.length < entries.length, `and the blank lines are a real difference: ${same.length} of ${entries.length} are identical`);
    assert(failed.length === 0, `each passes the layout rules and reconstructs to the view the layout editor's chain built (${report(failed)})`);
  });

  section('chain-write: the VS Code extension\'s conversions - the same calls, the house layout', () => {
    /* NORMALISED, three things, all layout:
     *   - the `v =` column is aligned across a control's block (rule 5 of the
     *     house layout; the extension wrote every attribute unpadded);
     *   - the blank lines are the skill's (the extension opened one after an
     *     `end( )` in front of an `ele( )`, which the skill rules out, and
     *     none between a control's attributes and a first `tag( )`);
     *   - a literal too long for its line hangs its `&&` pieces under the
     *     first one, not one level in from the call - so the pieces are cut
     *     at other characters, and join to the same text.
     * The factory shape is the extension's: `factory( ).` as a statement of
     * its own, the chain one level further left. */
    const entries = corpus('vscode-extension');
    const differs = [];
    const failed = [];
    for (const { id, xml, expected } of entries) {
      const root = parseXml(xml);
      const { text } = writeChain(asExtension(root.children[0]), { indent: 4, factory: 'detached' });
      if (calls(text) !== calls(expected)) differs.push(id);
      failed.push(...held(id, text, rebuilt(frame(expected))[0]));
    }
    assert(entries.length >= 30 && differs.length === 0, `the ${entries.length} chains make the calls the extension's made (differ: ${differs.join(', ') || 'none'})`);
    assert(failed.length === 0, `each passes the layout rules and reconstructs to the view the extension's chain built (${report(failed)})`);
  });

  // ------------------------------------------------------- the round trip

  section('chain-write: an XML view written as a chain reconstructs to that view, in every factory shape', () => {
    /* Straight from the parser: `writeChain( parseXml( xml ) )`. Every value
     * goes through `v` as it stands - a `{…}` stays the binding it is, an
     * escaped brace stays escaped - so the reconstruction is the document. */
    const views = fs.readdirSync(FIX).filter((name) => /\.(view|fragment)\.xml$/.test(name) && !/malformed/.test(name))
      .map((name) => [name, fs.readFileSync(f(name), 'utf8')])
      .concat(corpus('vscode-extension').filter(({ id }) => !/malformed/.test(id)).map(({ id, xml }) => [id, xml]))
      .concat([['specials', '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Page title="a `tick`, &quot;quotes&quot;, &lt;angle&gt; &amp; \'more\'">'
        + '<Text text="{= ${/A} > 1 ? \'x\' : \'y\' }" tooltip="\\{escaped\\} 100%" class=""/><Input value="{path:\'/V\',type:\'sap.ui.model.type.Integer\'}"/></Page></mvc:View>']]);
    const failed = [];
    let written = 0;
    for (const [id, xml] of views) {
      const root = parseXml(xml);
      if (root.children.length !== 1 || unwritable(root)) continue;
      const view = toXml(root);
      for (const factory of ['attached', 'detached']) {
        failed.push(...held(`${id} (${factory})`, writeChain(root, { indent: 4, factory }).text, view));
        written += 1;
      }
    }
    assert(written >= 80, `enough views to mean something (${written} chains)`);
    assert(failed.length === 0, `every one passes the layout rules and reconstructs to its document (${report(failed)})`);
  });

  // ------------------------------------------------------------ the layout

  section('chain-write: the house layout, line by line', () => {
    const tree = {
      name: 'View', ns: 'mvc',
      attrs: [['xmlns', 'sap.m'], ['xmlns:mvc', 'sap.ui.core.mvc']],
      children: [{
        name: 'Page', attrs: [{ name: 'title', value: 'My App' }],
        children: [
          {
            name: 'List', attrs: [{ name: 'items', raw: 'client->_bind( t_items )' }],
            children: [{
              name: 'items', attrs: [],
              children: [{ name: 'StandardListItem', attrs: [['title', '{PRODUCT}'], ['info', '{QUANTITY}']], children: [] }],
            }],
          },
          { name: 'Button', attrs: [['text', 'Save'], { name: 'enabled', raw: 'abap_true', boolean: true }, { name: 'press', raw: 'client->_event( `SAVE` )' }], children: [] },
        ],
      }],
    };
    // the skill's own example (view-chain-layout, abap2UI5/abap2UI5), with a
    // boolean added
    const skill = [
      '  DATA(view) = z2ui5_cl_ui5_view_builder=>factory(',
      '      )->ele( n = `View` ns = `mvc`',
      '          )->a( n = `xmlns`     v = `sap.m`',
      '          )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`',
      '',
      '          )->ele( `Page`',
      '              )->a( n = `title` v = `My App`',
      '',
      '              )->ele( `List`',
      '                  )->a( n = `items` v = client->_bind( t_items )',
      '',
      '                  )->ele( `items`',
      '                      )->tag( `StandardListItem`',
      '                          )->a( n = `title` v = `{PRODUCT}`',
      '                          )->a( n = `info`  v = `{QUANTITY}`',
      '',
      '                  )->end(',
      '              )->end(',
      '',
      '              )->tag( `Button`',
      '                  )->a( n = `text`    v = `Save`',
      '                  )->a( n = `enabled` b = abap_true',
      '                  )->a( n = `press`   v = client->_event( `SAVE` ) ).',
    ];
    const attached = writeChain(tree, { indent: 2 });
    assert(attached.text === skill.join('\n'), 'the skill\'s example comes out as the skill writes it');
    assert(attached.lines.length === attached.owners.length && attached.owners[0] === null && attached.owners[4] === null
      && attached.owners[1] === tree && attached.owners[22] === tree.children[0].children[1],
      'owners: a node per line, null for the factory line and a blank one');

    const detached = writeChain(tree, { indent: 2, factory: 'detached' }).lines;
    assert(detached[0] === '  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).' && detached[1] === '  view->ele( n = `View` ns = `mvc`'
      && detached[2] === '      )->a( n = `xmlns`     v = `sap.m`' && detached[5] === '      )->ele( `Page`',
      'detached: factory( ). on its own, the chain off the variable, one level further left');
    assert(writeChain(tree, { variable: 'popup', factory: 'detached' }).lines[1].startsWith('popup->ele(')
      && writeChain(tree, { assignment: 'view = ' }).lines[0] === 'view = z2ui5_cl_ui5_view_builder=>factory(',
      'the variable and the assignment are the caller\'s (a 7.02 class declares the variable itself)');

    const inner = writeChain(tree.children[0], { indent: 8, factory: 'none', keepTrailingEnds: true }).lines;
    assert(inner[0] === '        )->ele( `Page`' && inner[inner.length - 1] === '        )->end(' && inner[inner.length - 2] === '',
      'none + keepTrailingEnds: a block for the inside of a chain, closed and not terminated');
    assert(writeChain(tree, { eol: '\r\n' }).text.split('\r\n').length === attached.lines.length, 'eol: the file\'s own line ending');
    assert(writeChain({ name: null, attrs: [], children: [tree] }).text === writeChain(tree).text, 'a document node stands for its one element');
    let threw = '';
    try { writeChain({ name: null, attrs: [], children: [tree, tree] }); } catch (e) { threw = e.message; }
    assert(/one root element/.test(threw), 'and a document with two roots is refused');
    assert(STEP === 4 && CHECKED_STEP === STEP, 'the step the writer writes is the step the rule checks');
  });

  section('chain-write: values - literals, pieces, wrapped ABAP, what cannot be written', () => {
    assert(abapLiteral('it`s') === '`it``s`' && abapLiteral(1) === '`1`', 'a backtick is doubled');
    const text = 'a`b '.repeat(200);
    const pieces = literalPieces(text, 60, 40);
    assert(pieces.length > 1 && pieces[0].length <= 60 && pieces.slice(1).every((p) => p.length <= 40)
      && pieces.map((p) => p.slice(1, -1).replaceAll('``', '`')).join('') === text,
      'literalPieces: every piece within its width as written, and together the text');
    assert(literalPieces('short', 60).length === 1 && literalPieces(text, 5).length === 1, 'one literal when it fits, and when there is no room to cut');

    // a literal over the line limit is cut, the pieces hanging under the first
    const long = { name: 'Text', attrs: [['id', 'x'], ['text', 'word '.repeat(120)]], children: [] };
    const { lines } = writeChain({ name: 'Page', attrs: [], children: [long] }, { indent: 4 });
    const at = lines.findIndex((line) => line.includes('n = `text`'));
    assert(lines.every((line) => line.length <= MAX_LINE) && lines[at + 1].indexOf('&& `') === lines[at].indexOf('v = `') + 1
      && lines[lines.length - 1].endsWith('` ).'),
      'a long literal: no line over 255, `&&` three columns left of the first piece, the statement closed on the last');

    // pieces the caller cut (the layout editor's, 7.02 constants among them)
    const pieced = attributeLines({ attrs: [{ name: 'text', key: 't', pieces: ['`a`', 'cl_abap_char_utilities=>newline', '`b`'] }] }, 8);
    assert(pieced[0] === '        )->a( n = `text` t = `a`\n                          && cl_abap_char_utilities=>newline\n                          && `b`',
      'pieces: one operand per line, under the first, through the parameter asked for');

    // ABAP over several lines keeps its shape, one level in from its call
    const wrapped = attributeLines({ attrs: [{ name: 'press', raw: 'client->_event( val   = `GO`\n                           t_arg = VALUE #( ( `a` )\n                                            ( `b` ) ) )' }] }, 8);
    assert(wrapped[0] === '        )->a( n = `press` v = client->_event( val   = `GO`\n            t_arg = VALUE #( ( `a` )\n                             ( `b` ) ) )',
      'raw: the continuation lines re-anchored, their shape relative to each other kept');

    // one control's block written again, the untouched values verbatim
    const block = attributeLines({ attrs: [{ name: 'id', raw: '`a`' }, { name: 'noDataText', raw: '`none`' }, { name: 'x', raw: '`y`' }] }, 4,
      { verbatim: (attr) => (attr.name === 'id' ? 'v = `a`  " kept' : attr.name === 'x' ? '\n          v = `y`' : undefined) });
    assert(block[0] === '    )->a( n = `id`         v = `a`  " kept' && block[1] === '    )->a( n = `noDataText` v = `none`' && block[2] === '    )->a( n = `x`\n          v = `y`',
      'attributeLines( verbatim ): only the padding is written, a value under its name keeps its line');

    const broken = { name: 'Text', attrs: [['text', 'two\nlines']], children: [] };
    let threw = '';
    try { writeChain(broken); } catch (e) { threw = e.message; }
    assert(/line break/.test(unwritable(broken)) && /line break/.test(threw) && unwritable({ name: 'a\nb', attrs: [], children: [] }) !== undefined
      && unwritable({ name: 'Text', attrs: [['text', 'fine']], children: [] }) === undefined,
      'a line break in a literal is said by unwritable( ) and refused by writeChain( ), never written');
  });

  section('chain-write: carries nothing but the builder vocabulary', () => {
    /* A browser tool without a bundler vendors this module as two files
     * (docs/agents/consumers.md); a third import would break that copy. */
    const source = fs.readFileSync(path.join(FIX, '..', '..', 'lib', 'chain-write.mjs'), 'utf8');
    const imports = [...source.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
    const builders = fs.readFileSync(path.join(FIX, '..', '..', 'lib', 'builders.mjs'), 'utf8');
    assert(imports.join() === './builders.mjs' && !/^import\s/m.test(builders) && !/\b(?:process|require|node:)\b/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')),
      `one import, of a module that has none, and no Node API (imports: ${imports.join(', ')})`);
  });
}
