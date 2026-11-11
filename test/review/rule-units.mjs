/*
 * The rule as one unit (lib/rule.mjs, lib/rules/) and the shared reading of a
 * class it checks against (lib/abap-model.mjs). What the rules themselves
 * report is asserted where it always was - their sections did not move when
 * the rules did, which is the point: same findings, one place to write them.
 * Here: the definition contract, the registries built from it, the model's
 * own answers, and the lines that keep both honest. See test/review/README.md
 * for the harness.
 */
import fs from 'fs';
import path from 'path';
import { defineRule, runRules, docOf } from '../../lib/rule.mjs';
import { UNIT_RULES, unitRule } from '../../lib/rules/index.mjs';
import { abapModel, elementsOf, findWords } from '../../lib/abap-model.mjs';
import { scrub, splitStatements } from '../../lib/abap.mjs';
import { RULES, defaultSeverityOf, describe, OPT_IN } from '../../lib/findings.mjs';
import { RULE_DOCS } from '../../lib/rule-docs.mjs';
import { FIXABLE } from '../../lib/fix.mjs';
import { SOURCE_RULES } from '../../lib/abap-rules.mjs';

const CLASS = `CLASS zcl_model DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
    DATA: count TYPE i VALUE 3 READ-ONLY,
          rows  TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    CONSTANTS c_max TYPE i VALUE 10.
    DATA: BEGIN OF ms_screen,
            title TYPE string,
          END OF ms_screen.
  PROTECTED SECTION.
    CLASS-DATA go_self TYPE REF TO zcl_model.
  PRIVATE SECTION.
    DATA mv_hidden TYPE abap_bool.
    METHODS helper IMPORTING iv_x TYPE i.
ENDCLASS.

CLASS zcl_model IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    " a CATCH in a comment is no statement.
    DATA lv_text TYPE string.
    lv_text = \`CATCH cx_root. ENDTRY.\`.
    DATA(lv_inline) = |{ name } has { count } rows.|.
    FIELD-SYMBOLS <ls_row> TYPE ty_row.
    LOOP AT rows ASSIGNING FIELD-SYMBOL(<ls_inline>).
    ENDLOOP.
    FINAL(lv_final) = c_max.
  ENDMETHOD.

  METHOD helper.
    TRY.
        name = 'it''s'.
      CATCH cx_root.
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
`;

const recase = (text, fn) => text.split('\n').map((line) => line.replace(/^([^`'|"]*)/, (m) => fn(m))).join('\n');

export default function ({ section, assert, f, FIX, checkAbapSource }) {
  const LIB = path.join(FIX, '..', '..', 'lib');
  const VALID = {
    id: 'sample-rule', severity: 'hint', category: 'structure', scope: 'class',
    summary: 's', detail: 'd', example: 'a', remedy: 'b', message: () => 'm', check: () => {},
  };

  section('rule units: a definition is validated where it is written', () => {
    const rule = defineRule(VALID);
    assert(Object.isFrozen(rule) && rule.fixable === false && rule.optIn === false, 'frozen, not fixable and not opt-in unless it says so');
    assert(defineRule({ ...VALID, fixNote: 'renames x' }).fixable === true, 'a fixNote is what makes a rule fixable');
    const refused = (change, re, what) => {
      let msg = '';
      try { defineRule({ ...VALID, ...change }); } catch (e) { msg = e.message; }
      assert(re.test(msg), `${what} (${msg || 'accepted'})`);
    };
    refused({ id: 'Sample_Rule' }, /kebab-case/, 'an id that is not kebab-case');
    refused({ severity: 'info' }, /severity must be one of/, 'a severity the linter does not have');
    refused({ scope: 'view' }, /scope must be one of/, 'a scope nothing runs');
    refused({ remedy: 'a' }, /remedy is the example/, 'a remedy equal to its example');
    refused({ detail: ' ' }, /'detail' must be a non-empty string/, 'an empty card field');
    refused({ message: 'text' }, /message must be a function/, 'a sentence that cannot read the finding');
    refused({ fixNote: '' }, /fixNote/, 'an empty fixNote');
    const doc = docOf(defineRule({ ...VALID, fixNote: 'n' }));
    assert(JSON.stringify(Object.keys(doc)) === '["category","summary","detail","example","remedy","fixNote"]', 'the card has RULE_DOCS\' shape');
  });

  section('rule units: every registry reads a unit rule from its definition', () => {
    assert(UNIT_RULES.length >= 4, `rules are defined as units (${UNIT_RULES.length})`);
    for (const rule of UNIT_RULES) {
      assert(RULES.includes(rule.id) && defaultSeverityOf(rule.id) === rule.severity, `${rule.id}: registered with its own severity`);
      assert(RULE_DOCS[rule.id]?.summary === rule.summary && RULE_DOCS[rule.id].example === rule.example, `${rule.id}: its card is in RULE_DOCS`);
      assert(FIXABLE.includes(rule.id) === rule.fixable, `${rule.id}: FIXABLE says what the definition says`);
      assert(OPT_IN.has(rule.id) === rule.optIn, `${rule.id}: OPT_IN says what the definition says`);
      assert(SOURCE_RULES.has(rule.id) === (rule.scope === 'class'), `${rule.id}: a class-scoped rule is a source rule`);
      assert(unitRule(rule.id) === rule && describe({ type: rule.id, member: 'x' }) === rule.message({ type: rule.id, member: 'x' }), `${rule.id}: describe( ) is its message`);
    }
  });

  section('rule units: one file per rule, named by its id, importing leaf modules only', () => {
    const files = fs.readdirSync(path.join(LIB, 'rules')).filter((n) => n.endsWith('.mjs') && n !== 'index.mjs').sort();
    assert(JSON.stringify(files) === JSON.stringify(UNIT_RULES.map((r) => `${r.id}.mjs`).sort()),
      `lib/rules holds exactly the listed rules (files: ${files.join(', ')})`);
    /* A rule may import any module that does not lead back to a registry:
     * findings, rule-docs and fix import the rules (and abap-rules runs
     * them), so reaching one of those from a rule is a cycle. Computed over
     * the static import graph, not kept as a list. */
    const REGISTRIES = new Set(['findings.mjs', 'rule-docs.mjs', 'fix.mjs', 'abap-rules.mjs', 'rules/index.mjs']);
    const importsOf = (rel) => [...fs.readFileSync(path.join(LIB, rel), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'";]*?from\s+'(\.[^']+)'/g)]
      .map((m) => path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
    const reaches = (rel, seen = new Set()) => {
      for (const dep of importsOf(rel)) if (!seen.has(dep)) { seen.add(dep); reaches(dep, seen); }
      return seen;
    };
    for (const file of files) {
      const text = fs.readFileSync(path.join(LIB, 'rules', file), 'utf8');
      const cyclic = [...reaches(`rules/${file}`)].filter((dep) => REGISTRIES.has(dep));
      assert(!cyclic.length, `${file} reaches no registry - the registries import the rules (reaches ${cyclic.join(', ') || 'none'})`);
      assert(!/type: '/.test(text), `${file} reports without a type: runRules( ) gives the finding the rule's id`);
    }
    for (const leaf of ['rule.mjs', 'abap-model.mjs', 'abap-helpers.mjs']) {
      const deps = [...reaches(leaf)].filter((dep) => REGISTRIES.has(dep));
      assert(!deps.length, `lib/${leaf} reaches no registry (reaches ${deps.join(', ') || 'none'})`);
    }
  });

  section('rule units: a rule written as a unit is reported from its file only', () => {
    /* A unit's file is meant to be the whole rule. A second emit site left
     * behind in a pass (too-many-children had one in the aggregation-tag
     * branch) reports the same id from code the file does not show. */
    const strays = [];
    const walkDir = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'rules' ? [] : walkDir(path.join(dir, e.name))) : [path.join(dir, e.name)]));
    for (const file of walkDir(LIB).filter((n) => n.endsWith('.mjs'))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const rule of UNIT_RULES) if (text.includes(`type: '${rule.id}'`)) strays.push(`${rule.id} in ${path.relative(LIB, file)}`);
    }
    assert(!strays.length, `no unit rule is also emitted by a pass (${strays.join(', ') || 'none'})`);
  });

  section('rule units: every message can be written for any finding', () => {
    /* A message is only written when a finding of its rule is reported, so a
     * name it uses and does not import (a helper findings.mjs used to hold)
     * stays hidden until some run hits it. Every one is called here with a
     * finding whose every field is a string. */
    const stub = new Proxy({}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'fixes' ? undefined : 'x') });
    const threw = [];
    for (const rule of UNIT_RULES) {
      try {
        if (typeof rule.message(stub) !== 'string') threw.push(`${rule.id}: not a string`);
      } catch (e) { threw.push(`${rule.id}: ${e.message}`); }
    }
    assert(!threw.length, `each unit rule's message is a string for a stub finding (${threw.join('; ') || 'all'})`);
  });

  section('rule units: runRules gives the id, honours scope and opt-in, and times each rule', () => {
    const seen = [];
    const mk = (id, extra = {}) => defineRule({ ...VALID, id, check: ({ report }) => report({ offset: 1 }), ...extra });
    const rules = [mk('a-rule'), mk('b-rule', { scope: 'app' }), mk('c-rule', { optIn: true })];
    const timings = new Map();
    runRules(rules, 'class', { report: (x) => seen.push(x) }, { timings });
    assert(seen.map((x) => x.type).join() === 'a-rule', `only the class-scoped rule that is not opt-in ran (${seen.map((x) => x.type).join()})`);
    assert(timings.has('rule:a-rule') && !timings.has('rule:b-rule') && timings.get('rule:a-rule') >= 0, 'the time is recorded per rule that ran, under rule:<id>');
    runRules(rules, 'class', { report: (x) => seen.push(x), enabled: (id) => id === 'c-rule' });
    assert(seen.map((x) => x.type).join() === 'a-rule,a-rule,c-rule', 'an opt-in rule runs when the run enables it');
  });

  section('abap model: tokens keep their offsets, literals and comments are not code', () => {
    const m = abapModel(CLASS);
    assert(m === abapModel(CLASS), 'one reading per source');
    assert(m.tokens.every((t) => (t.kind === 'literal' ? m.src : m.code).slice(t.start, t.end) === t.text), 'every token is the text at its offsets');
    assert(m.statementsOf('CATCH').length === 1 && m.methodAt(m.statementsOf('CATCH')[0].start).name === 'helper',
      'the CATCH in a comment and the one in a literal are no statements; the real one is in helper( )');
    const lit = m.tokens.filter((t) => t.kind === 'literal').map((t) => t.text);
    assert(lit.includes("'it''s'") && lit.includes('`CATCH cx_root. ENDTRY.`') && lit.some((t) => t.startsWith('|{ name }')),
      `a doubled quote, a period in a literal and a template are one token each (${lit.join(' ')})`);
    assert(m.tokens.some((t) => t.text === 'z2ui5_if_app') && m.tokens.some((t) => t.text === '<ls_row>') && m.tokens.some((t) => t.upper === 'FIELD-SYMBOLS'),
      'a compound keyword and a field symbol are words');
    assert([...findWords(m.tokens, ['LOOP', 'AT'])].length === 1 && [...findWords(m.tokens, ['PUBLIC', 'SECTION'])].length === 1, 'findWords reads a phrase across blanks');
  });

  section('abap model: classes, sections, attributes, methods and locals', () => {
    const m = abapModel(CLASS);
    assert(m.classes.map((c) => `${c.name}:${c.part}`).join() === 'zcl_model:definition,zcl_model:implementation', 'both parts of the class');
    const attrs = Object.fromEntries(m.attributes.map((a) => [a.name, a]));
    assert(Object.keys(attrs).join() === 'name,count,rows,c_max,ms_screen,go_self,mv_hidden', `every attribute, a structure as one (${Object.keys(attrs).join()})`);
    assert(attrs.name.visibility === 'public' && attrs.go_self.visibility === 'protected' && attrs.mv_hidden.visibility === 'private', 'each in its section');
    assert(attrs.count.readOnly && attrs.count.type === 'i' && attrs.rows.type === 'standard table of ty_row with empty key'
      && attrs.c_max.kind === 'constant' && attrs.go_self.kind === 'class-data' && attrs.go_self.type === 'ref to zcl_model'
      && attrs.ms_screen.structure, 'kind, type as written, READ-ONLY and the structure flag');
    assert(m.attribute('MV_HIDDEN') === attrs.mv_hidden && m.attribute('title') === null, 'looked up in any case; a component is not an attribute');
    assert(m.methods.map((x) => `${x.fullName}=${x.name}`).join() === 'z2ui5_if_app~main=main,helper=helper', 'methods with and without an interface prefix');
    const locals = m.methods[0].locals.map((l) => `${l.kind}:${l.name}`).join();
    assert(locals === 'data:lv_text,inline:lv_inline,field-symbol:<ls_row>,field-symbol:<ls_inline>,inline:lv_final', `declared, inline and field-symbol locals (${locals})`);
    const at = CLASS.indexOf('DATA mv_hidden');
    assert(m.sectionAt(at) === 'private' && m.sectionAt(CLASS.indexOf('DATA name')) === 'public' && m.sectionAt(CLASS.indexOf('METHOD helper')) === null, 'sectionAt answers inside a definition only');
    const chain = m.statementsOf('DATA').find((s) => s.chained);
    assert(chain && elementsOf(chain).length === 2 && elementsOf(chain)[1][0].text === 'rows', 'a chained statement has one element per name');
  });

  section('abap model: signatures, and a name resolved where it is used', () => {
    const src = `CLASS zcl_s DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA count TYPE i.
    DATA total TYPE i.
    METHODS add
      IMPORTING iv_step       TYPE i
                VALUE(iv_big) TYPE int8 OPTIONAL
                io_ref        TYPE REF TO zcl_s
      RETURNING VALUE(rv_sum) TYPE i
      RAISING   cx_static_check.
    CLASS-METHODS: create RETURNING VALUE(ro_s) TYPE REF TO zcl_s, reset.
ENDCLASS.
CLASS zcl_s IMPLEMENTATION.
  METHOD add.
    DATA count TYPE string.
    count = CONV i( iv_step ).
    total = CONV i( iv_step ).
    rv_sum = CONV i( iv_big ).
  ENDMETHOD.
  METHOD reset.
    count = CONV i( '3' ).
  ENDMETHOD.
ENDCLASS.
`;
    const m = abapModel(src);
    const add = m.signature('ADD');
    assert(add.params.map((p) => `${p.direction}:${p.name}:${p.type}${p.byValue ? ':value' : ''}`).join() === 'importing:iv_step:i,importing:iv_big:int8:value,importing:io_ref:ref to zcl_s,returning:rv_sum:i:value',
      `every parameter with direction, type and VALUE( ) (${add.params.map((p) => `${p.direction}:${p.name}:${p.type}`).join()})`);
    assert(m.signature('create').static && m.signature('create').params[0].type === 'ref to zcl_s' && m.signature('reset').params.length === 0
      && m.signature('z2ui5_if_app~main') === null, 'a chained CLASS-METHODS declares each method; an interface method has no signature here');
    const inAdd = src.indexOf('count = CONV');
    const inReset = src.lastIndexOf('count = CONV');
    assert(m.resolve('count', inAdd).origin === 'local' && m.resolve('count', inAdd).type === 'string', 'in add( ) the local hides the attribute');
    assert(m.resolve('COUNT', inReset).origin === 'attribute' && m.resolve('count', inReset).type === 'i', 'in reset( ) the same name is the attribute');
    assert(m.resolve('iv_step', inAdd).origin === 'parameter' && m.resolve('iv_step', inReset) === null && m.resolve('sy-subrc', inAdd) === null,
      'a parameter exists in its own method only; an undeclared name resolves to nothing');
    const hits = checkAbapSource(src, { render: false, allClasses: true }).findings.filter((x) => x.type === 'redundant-conv-i');
    assert(hits.map((x) => `${x.member}@${x.line}`).join() === 'total@17,rv_sum@18,count@21',
      `redundant-conv-i reads the scope: not the string local, the attribute and the returning parameter, and count where it IS the attribute (${hits.map((x) => `${x.member}@${x.line}`).join()})`);
  });

  section('abap model: the case of a keyword changes nothing', () => {
    const shape = (text) => {
      const m = abapModel(text);
      return JSON.stringify([m.statements.map((s) => s.keyword), m.attributes.map((a) => `${a.visibility}:${a.kind}:${a.name}`), m.methods.map((x) => [x.name, x.locals.map((l) => l.name)])]);
    };
    const base = shape(CLASS);
    assert(shape(recase(CLASS, (s) => s.toUpperCase())) === base && shape(recase(CLASS, (s) => s.toLowerCase())) === base,
      'upper case, lower case and mixed case read as the same class');
  });

  section('abap model: it agrees with splitStatements on every fixture, and recovers where that cannot', () => {
    let compared = 0;
    const off = [];
    for (const name of fs.readdirSync(FIX).filter((n) => n.endsWith('.clas.abap'))) {
      const text = fs.readFileSync(f(name), 'utf8');
      const m = abapModel(text);
      const old = splitStatements(scrub(text)).filter((s) => s.text.trim());
      const lastIsEndclass = m.statements[m.statements.length - 1]?.keyword === 'ENDCLASS';
      // a chain with unbalanced parentheses runs the old splitter to the end of the file
      const balanced = old[old.length - 1]?.text.trim().toUpperCase() === 'ENDCLASS';
      if (balanced) { compared++; if (old.length !== m.statements.length) off.push(name); } else if (!lastIsEndclass && /ENDCLASS\s*\.\s*$/i.test(text)) off.push(`${name} (not recovered)`);
    }
    assert(compared > 40 && !off.length, `same statements on ${compared} fixtures, and a class the old splitter loses still ends in ENDCLASS here (off: ${off.join(', ') || 'none'})`);
    const broken = abapModel('METHOD a.\n  view->ele( `Page` ) ).\n  x = 1.\nENDMETHOD.\nMETHOD b.\n  y = f( 2 .\n  z = 3.\nENDMETHOD.\n');
    assert(broken.statements.map((s) => s.keyword).join() === 'METHOD,VIEW,X,ENDMETHOD,METHOD,Y,Z,ENDMETHOD',
      `a ")" too many and a "(" never closed each cost their own statement only (${broken.statements.map((s) => s.keyword).join()})`);
  });

  section('rule units: the migrated rules read the model - shapes the old scans got wrong', () => {
    const of = (src, id) => checkAbapSource(src, { render: false, allClasses: true }).findings.filter((x) => x.type === id);
    const wrap = (def, impl = '') => `CLASS zcl_u DEFINITION PUBLIC.\n${def}\nENDCLASS.\nCLASS zcl_u IMPLEMENTATION.\n  METHOD run.\n${impl}\n  ENDMETHOD.\nENDCLASS.\n`;
    // a SECOND class's public section is public too: the old scan knew the first one only
    const two = `CLASS lcl_a DEFINITION.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\nCLASS lcl_b DEFINITION.\n  PUBLIC SECTION.\n    CLASS-METHODS class_constructor.\nENDCLASS.\n`;
    assert(of(two, 'class-constructor-visibility').length === 0, 'class_constructor in the public section of a second class is fine');
    assert(of(wrap('  PUBLIC SECTION.\n    METHODS run.\n  PRIVATE SECTION.\n    CLASS-METHODS: helper, class_constructor.'), 'class-constructor-visibility').length === 1,
      'the chained form outside PUBLIC is reported');
    // a component named boolc is no call of the built-in
    assert(of(wrap('  PUBLIC SECTION.\n    METHODS run.', '    DATA(a) = ls_flags-boolc.\n    DATA(b) = boolc( a = 1 ).'), 'boolc-instead-of-xsdbool').length === 1,
      'only the call is reported, not a component of that name');
    assert(of(wrap('  PUBLIC SECTION.\n    METHODS run.', '    TRY.\n        x( ).\n      CATCH BEFORE UNWIND cx_a cx_b.\n    ENDTRY.'), 'empty-catch-block')[0]?.member === 'cx_a',
      'the exception is named past BEFORE UNWIND');
    assert(of(wrap('  PUBLIC SECTION.\n    METHODS run.', '    SELECT * FROM scarr\n      INTO CORRESPONDING FIELDS\n      OF TABLE @DATA( lt_c ).'), 'into-corresponding-inline-decl')[0]?.member === 'lt_c',
      'the phrase is found across line breaks');
  });
}
