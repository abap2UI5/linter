/*
 * Review round 2026-09 - the reconstructor, the CLI plumbing and the case
 * policy. See test/review/README.md for the harness.
 */
import fs from 'fs';
import path from 'path';
import { parseNamedArgs } from '../../lib/abap.mjs';
import { usesBuilderFactory } from '../../lib/builders.mjs';
import { elementBoundSlots } from '../../lib/abap-source.mjs';
import { badgeEndpoint, summarize, runStats } from '../../lib/report.mjs';
import { cacheable } from '../../lib/cache.mjs';
import { collectFiles } from '../../lib/index.mjs';
import { parseConfig } from '../../lib/config.mjs';

/*
 * ABAP is case-insensitive outside its literals and comments. `DATA(VIEW) =
 * Z2UI5_CL_UI5_VIEW_BUILDER=>FACTORY( )` is the statement `data(view) = …`
 * is, and a pretty printer set to "uppercase" or "lowercase" produces
 * exactly such sources. Recase a fixture outside literals and comments and
 * the linter has to say the same thing about it - the same finding types on
 * the same lines and columns (recasing keeps every length), the same
 * reconstructed documents. Before this gate an all-uppercase class was not
 * collected at all and a lowercase-keyword corpus lost 166 of 173 views.
 */
export function recase(source, mode) {
  const conv = mode === 'upper' ? (c) => c.toUpperCase() : (c) => c.toLowerCase();
  return source.split('\n').map((line) => {
    if (/^\*/.test(line)) return line;
    let out = '';
    let str = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (str) {
        out += c;
        if (str === '|' && c === '\\') { out += line[++i] ?? ''; continue; }
        if (c === str) str = null;
        continue;
      }
      if (c === '`' || c === "'" || c === '|') { str = c; out += c; continue; }
      if (c === '"') { out += line.slice(i); break; }
      out += conv(c);
    }
    return out;
  }).join('\n');
}

export default async function ({ section, assert, f, FIX, tempDir, checkAbapSource, prepareAbap }) {
  const fixtures = fs.readdirSync(FIX).filter((n) => n.endsWith('.clas.abap')).sort();
  const opts = { render: false, rules: { 'chain-house-layout': 'hint' } };
  const shape = (r) => r.findings.map((x) => `${x.type}@${x.line}:${x.column}`).sort();

  section('case policy: every fixture recased to upper and lower case is judged identically', () => {
    for (const name of fixtures) {
      const source = fs.readFileSync(f(name), 'utf8');
      const base = checkAbapSource(source, opts);
      for (const mode of ['upper', 'lower']) {
        const other = checkAbapSource(recase(source, mode), opts);
        assert(other.usesBuilder === base.usesBuilder, `${name} ${mode}: usesBuilder ${other.usesBuilder} (original ${base.usesBuilder})`);
        assert(other.docs.length === base.docs.length, `${name} ${mode}: ${other.docs.length} documents (original ${base.docs.length})`);
        assert(other.docs.join('\n') === base.docs.join('\n'), `${name} ${mode}: the reconstructed documents are identical`);
        const a = shape(base).join(' ');
        const b = shape(other).join(' ');
        assert(a === b, `${name} ${mode}: same findings\n      original: ${a}\n      recased:  ${b}`);
      }
    }
  });

  section('case policy: an all-uppercase class is collected and reconstructed', () => {
    const dir = tempDir('abap2ui5lint-case-');
    fs.writeFileSync(path.join(dir, 'zcl_up.clas.abap'), recase(fs.readFileSync(f('good.clas.abap'), 'utf8'), 'upper'));
    const files = collectFiles([dir]);
    assert(files.length === 1, 'collectFiles keeps the uppercase class');
    assert(usesBuilderFactory('Z2UI5_CL_UI5_VIEW_BUILDER => FACTORY( )'), 'the factory test is case- and space-insensitive');
    assert(!usesBuilderFactory('z2ui5_cl_ui5_view_builder_x=>factory( )'), 'a longer class name is not the builder');
  });

  section('declarations: every spelling of a table declaration yields a table in the model', () => {
    const src = fs.readFileSync(f('review_decl.clas.abap'), 'utf8');
    const prep = prepareAbap(src);
    for (const t of ['MT_CHAINED', 'MT_SORTED', 'MT_PLAIN', 'MT_ALIAS', 'MT_INLINE', 'MT_COLON']) {
      assert(Array.isArray(prep.model[t]), `${t} is a table in the render model`);
      assert(Array.isArray(prep.modelShape[t]) && prep.modelShape[t][0] && 'TITLE' in prep.modelShape[t][0], `${t} has a declared row in the shape`);
    }
    assert(prep.model.MV_READONLY === 5, `READ-ONLY scalar keeps its VALUE (got ${JSON.stringify(prep.model.MV_READONLY)})`);
    assert(prep.model.MV_CLASS === '', 'CLASS-DATA is declared');
    assert(prep.model.MV_LIKE === '', 'LIKE takes the referenced declaration');
    assert(typeof prep.modelShape.MS_COLON === 'object' && 'TEXT' in prep.modelShape.MS_COLON, 'an inline structure inside a DATA: chain keeps its fields');
    for (const n of ['MT_CHAINED', 'MT_SORTED', 'MT_PLAIN', 'MT_ALIAS', 'MT_INLINE', 'MT_COLON', 'MV_COLON', 'MS_COLON', 'MV_AFTER', 'MV_READONLY', 'MV_CLASS', 'MV_LIKE']) {
      assert(prep.rootFields.has(n), `${n} is a root field`);
    }
    assert(!prep.notes.some((n) => /no DATA declaration/.test(n)), `no bound variable is undeclared: ${prep.notes.filter((n) => /no DATA/.test(n)).join('; ')}`);
    const r = checkAbapSource(src, opts);
    const unknown = r.findings.filter((x) => x.type === 'unknown-binding-path').map((x) => x.value).sort();
    assert(unknown.join(',') === ['NOPE1', 'NOPE2', 'NOPE3', 'NOPE4', 'NOPE5', 'NOPE6'].join(','),
      `a wrong field in every template is reported (got ${unknown.join(',')})`);
  });

  section('seeds: a |…| template in a VALUE #( ) row is a string, never a structural parenthesis', () => {
    const src = fs.readFileSync(f('review_seeds.clas.abap'), 'utf8');
    const prep = prepareAbap(src);
    const rows = prep.model.MT_ROWS;
    assert(Array.isArray(rows) && rows.length === 4, `four rows survive (got ${rows?.length})`);
    assert(rows?.[0]?.DESCR === 'Price (net)', 'a template without interpolation is its text');
    assert(rows?.[1]?.DESCR === 'x)' && rows?.[1]?.STATE === 'Warning', 'a parenthesis inside a template does not end the row');
    assert(rows?.[2]?.DESCR === "it's (ok)" && rows?.[2]?.STATE === 'Error', "a '…' literal with a doubled quote is one literal");
    assert(rows?.[3]?.STATE === 'None' && (rows?.[3]?.DESCR ?? '') === '', 'a template with an interpolation keeps the field default');
    assert(prep.model.MV_SUB === 'Sub', `a template seed of a scalar is its text (got ${JSON.stringify(prep.model.MV_SUB)})`);
    const doc = prep.docs[0] || '';
    assert(/title="closed"/.test(doc), `a comparison (IF mv_title = \`open\`) is not an assignment - the last ASSIGNED literal wins (${doc.match(/title="[^"]*"/)?.[0]})`);
  });

  section('parseNamedArgs: keys are case-folded and => is not an argument boundary', () => {
    const a = parseNamedArgs(' n = `visible` v = zcl_const=>c_true ');
    assert(a.v === 'zcl_const=>c_true', `the static access stays in the value (got ${JSON.stringify(a)})`);
    assert(!('zcl_const' in a), 'no phantom argument');
    const b = parseNamedArgs(' VAL = mv_x PATH = abap_true ');
    assert(b.val === 'mv_x' && b.path === 'abap_true', `uppercase parameter names are read (got ${JSON.stringify(b)})`);
  });

  section('badge: an opt-in rule nobody switched on does not count as passed', () => {
    const s = { ...summarize([]), files: 1, failing: 0 };
    const off = badgeEndpoint(s, runStats([]), { kind: 'checks', rules: {} }).message;
    const on = badgeEndpoint(s, runStats([]), { kind: 'checks', rules: { 'chain-house-layout': 'warning' } }).message;
    const n = (m) => Number(m.replace(/[^\d]/g, ''));
    assert(n(on) === n(off) + 1, `switching the opt-in rule on adds one rule to the count (${off} vs ${on})`);
  });

  section('cache: a stored result carries what the replay reads, not the documents', () => {
    const r = checkAbapSource(fs.readFileSync(f('good.clas.abap'), 'utf8'), opts);
    const c = cacheable(r);
    assert(!('docs' in c) && !('model' in c) && !('docKinds' in c), 'docs, model and docKinds are stripped');
    for (const k of ['kind', 'usesBuilder', 'findings', 'renderErrors', 'skippedRender', 'helperTokens', 'notes', 'stats', 'ruleHits']) {
      assert(k in c, `${k} is kept`);
    }
    assert('docs' in r, 'the live result is untouched');
  });

  section('directives: a directive inside a string literal is text, one in a comment counts', () => {
    const src = fs.readFileSync(f('good.clas.abap'), 'utf8');
    const base = checkAbapSource(src, opts).findings.length;
    // a literal that merely CONTAINS the directive text must not open a block
    const inLiteral = src.replace('METHOD z2ui5_if_app~main.', 'METHOD z2ui5_if_app~main.\n    DATA(lv_note) = `abap2ui5lint-disable`.');
    assert(checkAbapSource(inLiteral, opts).findings.length === base, 'a literal carrying the directive text suppresses nothing');
    const inComment = src.replace('METHOD z2ui5_if_app~main.', 'METHOD z2ui5_if_app~main.\n    " abap2ui5lint-disable');
    assert(checkAbapSource(inComment, opts).findings.length === 0, 'the same text in a comment opens a block');
  });

  section('elementBoundSlots: the constant may be reached through the interface or me->client', () => {
    const cls = (view) => `CLASS zcl DEFINITION PUBLIC. ENDCLASS. CLASS zcl IMPLEMENTATION. METHOD x. client->_event_client( val = client->cs_event-bind_element t_arg = VALUE #( ( \`/T\` ) ) view = ${view} ). ENDMETHOD. ENDCLASS.`;
    for (const view of ['z2ui5_if_client=>cs_view-popup', 'me->client->cs_view-popup', 'CLIENT->CS_VIEW-POPUP']) {
      const r = elementBoundSlots(cls(view));
      assert(!r.all && r.slots.has('POPUP') && r.slots.size === 1, `${view} binds exactly the POPUP slot (all=${r.all}, slots=${[...r.slots]})`);
    }
  });

  /*
   * Every ABAP hygiene rule - the 256-column line that fails to import, the
   * abapGit round-trip family, the activation rules - ran only over a class
   * that calls the view builder; every other .clas.abap was dropped at
   * collection. AGENTS.md justified source-line-too-long with "a class that
   * cannot be imported is the most severe thing this tool can find", which held
   * for app classes only. `allClasses` collects every class and judges the ones
   * that build no view by the source-side rules alone.
   */
  section('all classes: a class that builds no view is judged by the source-side rules alone', () => {
    const plain = 'CLASS zcl_helper DEFINITION PUBLIC.\r\n  PUBLIC SECTION.\r\n    METHODS run.\r\nENDCLASS.\r\n\r\n'
      + 'CLASS zcl_helper IMPLEMENTATION.\r\n  METHOD run.   \r\n    DATA t TYPE STANDARD TABLE OF i WITH DEFAULT KEY.\r\n'
      + '    LOOP AT t INTO DATA(row).\r\n      READ TABLE t INDEX 1 INTO DATA(x).\r\n      DELETE t INDEX sy-tabix.\r\n    ENDLOOP.\r\n  ENDMETHOD.\r\nENDCLASS.\r\n';
    const dir = tempDir('abap2ui5lint-allclasses-');
    fs.writeFileSync(path.join(dir, 'zcl_helper.clas.abap'), plain);
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'zcl_app.clas.abap'));
    fs.writeFileSync(path.join(dir, 'zcl_helper.clas.testclasses.abap'), plain);
    assert(collectFiles([dir]).length === 1, 'without the option only the app class is collected');
    const all = collectFiles([dir], { allClasses: true });
    assert(all.length === 2 && all.some((x) => x.endsWith('zcl_helper.clas.abap')), `with it every class is (${all.length})`);
    assert(!all.some((x) => x.includes('testclasses')), 'a test include is still not a class to judge');

    const off = checkAbapSource(plain, { render: false });
    assert(off.usesBuilder === false && off.findings.length === 0, 'handed the class without the option, the library says nothing');
    const on = checkAbapSource(plain, { render: false, allClasses: true });
    const types = [...new Set(on.findings.map((x) => x.type))].sort();
    assert(on.usesBuilder === false, 'the class is still not a builder class');
    assert(types.includes('crlf-line-ending') && types.includes('trailing-whitespace') && types.includes('delete-index-in-loop'),
      `the round-trip family and the activation rules report (${types.join(', ')})`);
    assert(!types.some((t) => /^(?:view-|missing-|unknown-|chain-|event-|redundant-|lifecycle-)/.test(t)),
      `no view, wire or lifecycle rule runs over a class with no view (${types.join(', ')})`);
    assert(on.findings.filter((x) => x.type === 'crlf-line-ending').every((x) => x.fixes?.length),
      'the fixes travel with the findings, as for an app class');
    assert(on.ruleHits['crlf-line-ending'] === 1, 'the rule hits are counted');

    // an app class is judged exactly as before, option or not
    const app = fs.readFileSync(f('good.clas.abap'), 'utf8');
    const shape = (r) => r.findings.map((x) => `${x.type}@${x.line}:${x.column}`).sort().join(' ');
    assert(shape(checkAbapSource(app, { render: false, allClasses: true })) === shape(checkAbapSource(app, { render: false })),
      'an app class gets the same verdict with the option');

    // the config key, validated like the other booleans
    assert(parseConfig('abap2ui5lint.jsonc', '{ "allClasses": true }').allClasses === true, 'the config key is read');
    let threw = null;
    try { parseConfig('abap2ui5lint.jsonc', '{ "allClasses": "yes" }'); } catch (e) { threw = e.message; }
    assert(/allClasses/.test(threw || ''), `a non-boolean is refused (${threw})`);
  });

}
