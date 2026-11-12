/*
 * test/sections/late - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, path, test, checkAbapSource, checkXmlSource, prepareAbap, f, FIX, assert, section, tempDir, by, good, broken, has, rules, rows, view, bad, xml } = H;


// ----------------------------------------------- the docs' builder verbs ----
/* The rule reference shows code a reader copies, and 11 of its 49 examples
 * called methods the view builder does not have (`view->leaf( … )`,
 * `->_generic( name = … )`) - the ROLE names lib/builders.mjs uses internally,
 * which were the verbs of a builder that is gone. It rendered on the published
 * page and in the README, and no reader could have known.
 *
 * Derived from the builder rather than from a list of bad spellings, so a
 * future rename of a verb takes the docs with it. */
section('rule docs', async () => {
    const { RULE_DOCS } = await import('../../lib/rule-docs.mjs');
    const { VIEW_BUILDER } = await import('../../lib/builders.mjs');

    const REAL = new Set([
      VIEW_BUILDER.open, VIEW_BUILDER.leaf, VIEW_BUILDER.att, VIEW_BUILDER.shut,
      'factory', 'stringify', 'render', 'xml_escape',
    ]);
    // a builder chain in the docs is written `view->x(` or `)->x(`; a client
    // call is `client->x(` and is not this gate's business
    const CHAIN_CALL = /(?:^|[\s(])(?:\w*view\w*|popup|popover|\)|\w*_x)->(\w+)\s*\(/g;

    /* One rule is ABOUT the builder that does not have these methods. Its example
     * has to show `page( )`/`button( )` or it is not showing the reader the code
     * they have in front of them. Named here rather than loosened for everyone,
     * so the gate still holds for the other 85. A second one REPORTS the old
     * builder's `_z2ui5( )->timer( )` helpers and has to name them in its
     * prose - its example and remedy are current-builder code and stay gated,
     * so only the two prose fields are named. */
    const ABOUT_THE_OLD_BUILDER = new Map([
      ['frozen-view-builder', null],
      ['obsolete-custom-control', new Set(['summary', 'detail'])],
    ]);

    const wrong = [];
    for (const [id, doc] of Object.entries(RULE_DOCS)) {
      if (ABOUT_THE_OLD_BUILDER.has(id) && ABOUT_THE_OLD_BUILDER.get(id) === null) continue;
      for (const field of ['summary', 'detail', 'example', 'remedy', 'fixNote']) {
        if (ABOUT_THE_OLD_BUILDER.get(id)?.has(field)) continue;
        const text = doc[field];
        if (typeof text !== 'string') continue;
        for (const [, verb] of text.matchAll(CHAIN_CALL)) {
          if (!REAL.has(verb)) wrong.push(`${id}.${field}: ->${verb}( )`);
        }
      }
    }
    assert(!wrong.length,
      `rule docs: every builder call names a method the builder has (${wrong.join('; ') || 'all real'})`);
});

/* ---------------------------------------------------------------------------
 * --screenshot: the render gate photographing instead of judging
 *
 * Runs against the real runtime like the gate assertions above do. What is
 * asserted is what the mode PROMISES and what silently broke while it was
 * being built: that a picture comes out at all, that it is of the view rather
 * than of an empty page (a sap.m.Page in a container of no height renders its
 * header and clips everything else - every check still passes and the picture
 * is blank), and that a class whose reconstruction is incomplete is refused
 * rather than photographed wrong.
 * ------------------------------------------------------------------------- */
section.browser('screenshot', async () => {
    const { screenshotFiles, mockModelFor } = await import('../../lib/index.mjs');
    const shots = await screenshotFiles([f('good.clas.abap')], { width: 400, height: 300 });
    assert(shots.length === 1 && Buffer.isBuffer(shots[0].png),
      `screenshot: the fixture comes back as a PNG (${shots[0]?.errors?.[0] ?? 'no png'})`);
    const png = shots[0].png;
    assert(png.slice(1, 4).toString() === 'PNG', 'screenshot: the buffer is a PNG');
    // IHDR carries the dimensions: full-page, so the WIDTH is the viewport's
    const width = png.readUInt32BE(16);
    assert(width === 400, `screenshot: the viewport is the one asked for (got ${width})`);
    assert(shots[0].errors.length === 0,
      `screenshot: the clean fixture photographs without errors (${shots[0].errors[0] ?? ''})`);
    /* The blank-picture regression, and the reason it needs its own assertion:
     * the whole view was in the DOM, correct and clipped to nothing, while every
     * check passed and the picture came back a header over an empty area. It is
     * caught differentially rather than by a magic byte count - the same view
     * with its content removed is what a clipped picture looks like, so a real
     * render has to be substantially bigger than that. */
    const { openRenderer } = await import('../../lib/render.mjs');
    const shooter = await openRenderer({ theme: 'sap_horizon', css: true });
    const VIEW = (content) => `<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc">`
      + `<Page title="Fixture">${content}</Page></mvc:View>`;
    try {
      const filled = await shooter.screenshot({ xml: VIEW('<content><Input value="{/NAME}"/><Button text="Go"/></content>'), model: { NAME: 'world' } });
      const empty = await shooter.screenshot({ xml: VIEW('') });
      assert(filled.png.length > empty.png.length * 1.2,
        `screenshot: the content is IN the picture, not clipped to a bare header (${filled.png.length} vs ${empty.png.length} bytes)`);
    } finally {
      await shooter.close();
    }

    /* The device matrix: one browser session, one entry per viewport, and the
     * size recorded so a caller can name the files apart. */
    const matrix = await screenshotFiles([f('good.clas.abap')], {
      sizes: [{ width: 390, height: 844 }, { width: 1280, height: 900 }],
    });
    assert(matrix.length === 2 && matrix.every((s) => s.png),
      `screenshot: every viewport comes back with a picture (${matrix.length} entries)`);
    assert(matrix[0].png.readUInt32BE(16) === 390 && matrix[1].png.readUInt32BE(16) === 1280,
      'screenshot: each picture is taken at the viewport it belongs to');

    /* Preview data. The model derived from a class only knows what the class
     * SEEDS literally, so a table filled by a SELECT photographs empty - which
     * is most real apps. A mock file next to the source fills it, with no flag
     * to remember. */
    {
      const dir = tempDir('a2u5-mock-');
      const source = path.join(dir, 'zcl_mock.clas.abap');
      fs.writeFileSync(source, `CLASS zcl_mock DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      TYPES: BEGIN OF ty_row,
               name TYPE string,
             END OF ty_row.
      DATA mt_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
  ENDCLASS.
  CLASS zcl_mock IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      view->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\`     v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( n = \`Page\` )->a( n = \`title\` v = \`Rows\`
          )->ele( n = \`content\`
          )->ele( n = \`List\` )->a( n = \`items\` v = client->_bind( mt_rows )
          )->tag( n = \`StandardListItem\` )->a( n = \`title\` v = \`{NAME}\` ).
      client->view_display( view->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.
  `);
      const empty = await screenshotFiles([source], { sizes: [{ width: 600, height: 400 }] });
      fs.writeFileSync(path.join(dir, 'zcl_mock.mock.json'),
        JSON.stringify({ MT_ROWS: [{ NAME: 'Berlin' }, { NAME: 'Rome' }, { NAME: 'Lisbon' }] }));
      assert(mockModelFor(source)?.MT_ROWS?.length === 3,
        'screenshot: the mock file next to the class is the preview data, by convention');
      const filled = await screenshotFiles([source], { sizes: [{ width: 600, height: 400 }] });
      assert(filled[0].png.length > empty[0].png.length,
        `screenshot: the mocked rows are IN the picture (${filled[0].png.length} vs ${empty[0].png.length} bytes)`);

      /* Merged over the derived model, not replacing it: a mock file naming one
       * table must not cost the class its other fields. */
      fs.writeFileSync(path.join(dir, 'zcl_mock.mock.json'), '{ broken');
      const broken = await screenshotFiles([source], { sizes: [{ width: 600, height: 400 }] });
      assert(broken[0].png && broken[0].errors.some((e) => /not valid JSON/.test(e)),
        `screenshot: a broken mock file is reported next to the picture it did not fill (${broken[0].errors[0] ?? 'silent'})`);
      fs.rmSync(dir, { recursive: true, force: true });
    }

    const refused = await screenshotFiles([f('frozenbuilder.clas.abap')]);
    assert(refused.every((s) => !s.png) && refused[0].errors.some((e) => /no view reconstructed/.test(e)),
      `screenshot: a class no view can be reconstructed from is refused with a reason (${refused[0]?.errors?.[0] ?? 'none'})`);
});

// a `client->` written INSIDE a string literal is prose about the API, not a
// use of it - the shape a self-documenting sample has in every corpus
section('prose is not code', async () => {
    const { checkAbapRules } = await import('../observe.mjs');
    const { applyFixes } = await import('../../lib/fix.mjs');
    const of = (src, type) => checkAbapRules(src).filter((x) => x.type === type);
    /* One method, one string, one real call - the MessageStrip shape: a class
     * that tells the reader which calls it makes, and then makes one. */
    const quoting = (prose) => `METHOD z2ui5_if_app~main.\n  DATA(t) = \`${prose}\`.\n`
      + '  client->view_display( r( ) ).\nENDMETHOD.\n';   // a FILE: no missing-final-newline fix in the way

    for (const [prose, type] of [
      ['bound with client->_bind_edit( )', 'obsolete-binder'],
      ['pushed with client->view_model_update( )', 'obsolete-model-update'],
      ['wired with client->_event_client( )', 'obsolete-frontend-event'],
      ['scoped with client->_bind( view = cs_view-popup )', 'obsolete-bind-argument'],
      ['bound with client->_bind( val = lv_local )', 'binding-to-local'],
      ["raised with client->_event( 'GHOST' )", 'event-without-handler'],
      // and the statement-shaped rules, which quote ABAP rather than a call
      ['a CLASS-METHODS class_constructor belongs in PUBLIC SECTION', 'class-constructor-visibility'],
      ['SELECT INTO CORRESPONDING FIELDS OF TABLE @DATA(lt_x) is 7.55', 'into-corresponding-inline-decl'],
    ]) {
      assert(of(quoting(prose), type).length === 0,
        `${type}: "${prose}" inside a string literal is prose, not a call`);
    }

    /* The half that made this more than noise: three of those rules carry a
     * fix, so a `--fix` run REWROTE the sentence - silently, inside a string
     * the app puts on screen. */
    const documented = quoting('bound with client->_bind_edit( )');
    const { output } = applyFixes(documented, checkAbapRules(documented));
    assert(output === documented,
      '--fix leaves a string literal alone - it used to rewrite the prose inside it');

    /* And the rules still see the calls that ARE calls, next to the prose. */
    const both = 'METHOD z2ui5_if_app~main.\n  DATA(t) = `use client->_bind_edit( ) here`.\n'
      + '  DATA(v) = client->_bind_edit( mv_x ).\n  client->view_display( r( ) ).\nENDMETHOD.\n';
    assert(of(both, 'obsolete-binder').length === 1,
      'the real _bind_edit( ) next to the quoted one is still reported');

    /* ---- and the same question asked of EVERY rule, from its own docs ----
     *
     * The eight above were found one at a time, by reading a report. This
     * asks all 124 at once and needs no corpus to do it: `RULE_DOCS[id].example`
     * is, by the rules-page gate, the shortest source that makes THAT rule
     * fire. Put it inside a string literal and the rule must go quiet - once
     * as a plain DATA statement (where nothing but a literal-blind scan could
     * find it) and once as the text of a control (where a rule that reads an
     * attribute VALUE might legitimately). Both shapes are checked because the
     * defect had instances in both halves: the ABAP scans and the hygiene
     * scans.
     *
     * A rule that reads literal content ON PURPOSE - an event name, an icon,
     * a bound path - belongs in READS_LITERALS with the reason. It is empty
     * today: no rule in the registry needs it, which is what makes the
     * assertion a flat "none of them". */
    const READS_LITERALS = new Map([
      // A name that TRAVELS as data. The rule's subject is the string itself,
      // so there is nothing to distinguish a quoted example from the real
      // thing - the same design AGENTS states for the icon scan.
      ['unknown-icon', 'an icon name is data (a status column, a constant)'],
      ['icon-too-new', 'same scan'],
      ['icon-removed', 'same scan'],
      ['ui5-internal-access', '`mProperties` reaches UI5 as a t_arg string'],
      // The rule's own example IS a literal in a DATA statement.
      ['commercial-ui5-host', 'the finding is a URL written as text'],
      ['unescaped-brace-in-style', 'the finding is a brace inside a literal'],
    ]);
    {
      const { RULE_DOCS } = await import('../../lib/rule-docs.mjs');
      const { RULES } = await import('../../lib/findings.mjs');
      const quote = (text) => text.replace(/`/g, '``').replace(/\r?\n/g, ' ');
      /* A COMPLETE, clean class - so every gate actually runs - with the
       * quoted example parked in a DATA statement that touches nothing. Not
       * an attribute value: several rules judge those on purpose, and this
       * has to ask the one question they cannot defend. */
      const beside = (example) =>
        'CLASS zcl_beside DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
        + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
        + 'CLASS zcl_beside IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
        + '    DATA(prose) = `' + quote(example) + '`.\n\n'
        + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
        + '    view->ele( n = `View` ns = `mvc`\n'
        + '        )->a( n = `xmlns`     v = `sap.m`\n'
        + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
        + '        )->ele( n = `Page`\n'
        + '            )->tag( n = `Text`\n'
        + '                )->a( n = `text` v = `hello` ).\n\n'
        + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\nENDCLASS.\n';
      const judge = (src) => checkAbapSource(src, { properties: true, minUi5: '1.71' }).findings;
      // whatever the frame reports on its own is not the literal's doing
      const frame = new Set(judge(beside('')).map((f) => f.type));
      assert(frame.size === 0, `the frame this asks in is clean (${[...frame].join(', ')})`);

      let judged = 0;
      const loud = [];
      for (const [id, doc] of Object.entries(RULE_DOCS)) {
        if (!RULES.includes(id) || !doc.example || READS_LITERALS.has(id)) continue;
        judged++;
        if (judge(beside(doc.example)).some((f) => f.type === id)) loud.push(id);
      }
      assert(judged > 100, `every registered rule with an example is asked (${judged})`);
      assert(loud.length === 0,
        `no rule reads its own example out of a string literal (${loud.join(', ') || 'none'})`);
      // and the exception list stays honest: an id that no longer needs it
      // should be taken out, not left standing as documentation of nothing
      for (const [id] of READS_LITERALS) {
        assert(RULES.includes(id), `READS_LITERALS names a rule that exists (${id})`);
        assert(judge(beside(RULE_DOCS[id].example)).some((f) => f.type === id),
          `${id} still reads a literal on purpose - otherwise drop it from READS_LITERALS`);
      }
    }
});

// A linter that THROWS on a half-written class is worse than one that reports
// nothing: the CLI dies mid-run and takes the findings for every other file
// with it. Every reader here walks the source with a regex or a paren scan,
// and a half-written class is the normal state of a file in an editor - the
// VS Code extension checks on every pause.
section('malformed sources are reported, not thrown at', async () => {
    const { checkAbapRules } = await import('../observe.mjs');
    const { applyFixes } = await import('../../lib/fix.mjs');

    /* Deterministic, so a failure is reproducible from the seed alone. */
    let rnd = 20260904;
    const next = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    const mutantsOf = (src) => {
      const out = [];
      // truncation - the shape a file has while it is being typed
      for (let i = 1; i <= 12; i++) out.push(src.slice(0, Math.floor((src.length * i) / 13)));
      // a character gone, and one doubled
      for (let i = 0; i < 6; i++) {
        const at = Math.floor(next() * src.length);
        out.push(src.slice(0, at) + src.slice(at + 1));
        out.push(src.slice(0, at) + src[at] + src.slice(at));
      }
      // an unbalanced delimiter, which is what breaks a paren or literal walk
      for (const ch of ['(', ')', '`', '|', "'", '.']) {
        out.push(src.slice(0, Math.floor(next() * src.length)) + ch
          + src.slice(Math.floor(next() * src.length)));
      }
      return out;
    };

    const names = fs.readdirSync(FIX).filter((n) => n.endsWith('.clas.abap')).sort().slice(0, 14);
    let checked = 0;
    for (const name of names) {
      const src = fs.readFileSync(f(name), 'utf8');
      for (const m of mutantsOf(src)) {
        checked++;
        try {
          checkAbapSource(m, { properties: true, minUi5: '1.71' });
          /* and the FIX path, which the suite runs under STRICT_FIXES: a span
           * that does not address the source it was computed from throws
           * there, and a source being edited is where an offset goes wrong. */
          const fixable = checkAbapRules(m).filter((x) => x.fixes?.length);
          if (fixable.length) applyFixes(m, fixable);
        } catch (e) {
          assert(false, `${name} mutant (${m.length} chars) threw: ${e.message.slice(0, 120)}`);
        }
      }
    }
    for (const name of fs.readdirSync(FIX).filter((n) => /\.(view|fragment)\.xml$/.test(n))) {
      const xml = fs.readFileSync(f(name), 'utf8');
      for (const m of mutantsOf(xml)) {
        checked++;
        try {
          checkXmlSource(m, { properties: true, minUi5: '1.71' });
        } catch (e) {
          assert(false, `${name} mutant (${m.length} chars) threw: ${e.message.slice(0, 120)}`);
        }
      }
    }
    assert(checked > 400, `enough mutants to mean something (${checked})`);
});

/* ABAP has three literal forms and the source scanners knew two of them.
 * `'…'` - the oldest, and the one every ABAPer outside this project's own
 * house style writes - was not tracked at all: a `)`, a `.`, a `"` or a `=`
 * inside a character literal read as the real thing. A `(` in one made a
 * view unreconstructible ("no view reconstructed from builder calls", an
 * ERROR) on ABAP a system compiles without a murmur. */
/* `|\n|` is a NEWLINE in the running app, and the transpiler is what settles
 * it: @abaplint/transpiler's StringTemplateTranspiler emits the template body
 * VERBATIM into a JavaScript backtick literal (it escapes only the backtick),
 * so the browser reads the escape with JavaScript's rules. The resolver here
 * dropped the backslash and kept the letter, which is how a documented type
 * binding came out as `{ type : "…",n path:"…" }` - a render error reported
 * against an example that runs. */
section('a template escape is the character it stands for', async () => {
    const { prepareAbap } = await import('../../lib/reconstruct.mjs');
    const app = (value) => `CLASS zcl_tpl DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.
ENDCLASS.
CLASS zcl_tpl IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    me->client = client.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory(
        )->ele( n = \`View\` ns = \`mvc\`
            )->a( n = \`xmlns\`     v = \`sap.m\`
            )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
            )->ele( \`Page\` )->a( n = \`title\` v = ${value} ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.
`;
    const titleOf = (value) => /title="([^"]*)"/.exec(prepareAbap(app(value)).docs?.[0] ?? '')?.[1] ?? '(none)';

    // the three control characters, as the transpiler passes them to the browser
    assert(titleOf('`a` && |\\n| && `b`') === 'a&#xA;b',
      `a template newline is a newline (${titleOf('`a` && |\\n| && `b`')})`);
    assert(titleOf('`a` && |\\t| && `b`') === 'a&#x9;b',
      `a template tab is a tab (${titleOf('`a` && |\\t| && `b`')})`);
    assert(titleOf('|a\\rb|') === 'a&#xD;b', `a template CR is a CR (${titleOf('|a\\rb|')})`);

    /* And everything OUTSIDE that set is still the character itself - which is
     * also JavaScript's rule, so the two agree the whole way. `\\|`, `\\{` and
     * `\\}` are how a template writes a delimiter at all. */
    assert(titleOf('|a\\|b|') === 'a|b', `an escaped pipe is a pipe (${titleOf('|a\\|b|')})`);
    assert(titleOf('|a\\{b\\}c|') === 'a{b}c', `escaped braces are braces (${titleOf('|a\\{b\\}c|')})`);
    assert(titleOf('|a\\\\b|') === 'a\\b', `an escaped backslash is one backslash (${titleOf('|a\\\\b|')})`);

    /* The shape that found it: a UI5 type binding written across two lines,
     * which the corpus and cookbook/model/expression_binding.md both use.
     * With the letter in place of the newline UI5 answers "Expected ':'
     * instead of 'p'" and the whole view fails to load. */
    const typed = '`{ type : "sap.ui.model.type.Integer",` && |\\n| && `  path:"/X" }`';
    assert(/title="\{ type : &quot;sap\.ui\.model\.type\.Integer&quot;,&#xA;  path:&quot;\/X&quot; \}"/.test(
      prepareAbap(app(typed)).docs?.[0] ?? ''),
      `the two-line type binding keeps its line break (${titleOf(typed)})`);
});

section('a character literal is a literal', async () => {
    const { scrub, parenRegion, topSplit, splitStatements, parseNamedArgs } = await import('../../lib/abap.mjs');
    const { checkAbapSource } = await import('../../lib/index.mjs');

    // the four structural characters, one per primitive
    assert(splitStatements("DATA(v) = 'v1.0'. WRITE v.").length === 2,
      "splitStatements: the '.' in 'v1.0' is text, not the end of the statement");
    assert(parenRegion("f( x = 'a) b' y = 2 )", 1).body.includes('y = 2'),
      "parenRegion: the ')' in a character literal does not close the call");
    assert(topSplit("'a && b' && c", '&&').length === 2,
      "topSplit: the separator inside a character literal is not a boundary");
    assert(/lv2 = 3/.test(scrub(`lv = 'say "hi"'. lv2 = 3.`)),
      'scrub: a double quote inside a character literal does not start a comment');
    assert(parseNamedArgs(" n = 'a  z = 1' v = 2 ").v === '2'
      && parseNamedArgs(" n = 'a  z = 1' v = 2 ").z === undefined,
      "parseNamedArgs: the '=' inside a character literal is not an argument");

    // the ABAP escape: '' is one quote, not the end and a new literal
    assert(splitStatements("DATA(v) = 'it''s. fine'. WRITE v.").length === 2,
      "splitStatements: a doubled '' is an escaped quote, not a close and reopen");

    /* The other direction, which is what kept ' out of these scanners for as
     * long as it was: an apostrophe in a COMMENT must not open anything. It
     * cannot, because every one of these runs on a scrubbed source and scrub
     * meets the `"` first - so this is the guard on that ordering. */
    const commented = 'DATA(a) = 1.\n" don\'t split here\nDATA(b) = 2.\n';
    assert(splitStatements(scrub(commented)).length === 2,
      "an apostrophe in a comment opens no literal");
    assert(splitStatements(scrub("* don't split here\nDATA(b) = 2.")).length === 1,
      "an apostrophe in a full-line comment opens no literal");
    // nor one inside another literal form
    assert(splitStatements("DATA(v) = `it's. here`. WRITE v.").length === 2,
      "an apostrophe inside a backtick literal is text");
    assert(splitStatements("DATA(v) = |it's. here|. WRITE v.").length === 2,
      "an apostrophe inside a string template is text");

    /* End to end, on the shape that found this: an attribute value written as
     * a character literal with an unbalanced paren in it. */
    const app = (lit) => `CLASS zcl_q DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.
ENDCLASS.
CLASS zcl_q IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    me->client = client.
    IF client->check_on_init( ).
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory(
          )->ele( n = \`View\` ns = \`mvc\`
              )->a( n = \`xmlns\`     v = \`sap.m\`
              )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\` ).
      DATA(page) = view->ele( \`Page\` )->a( n = \`title\` v = ${lit} ).
      page->tag( \`Text\` )->a( n = \`text\` v = client->_bind( name ) ).
      client->view_display( view->stringify( ) ).
      RETURN.
    ENDIF.
    IF client->check_on_navigated( ).
      client->view_display( \`<x/>\` ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
`;
    for (const lit of ["'Net (total'", "'v1.0'", `'say "hi"'`, "'it''s'"]) {
      const found = checkAbapSource(app(lit)).findings;
      assert(found.length === 0,
        `a title written as ${lit} builds a view like any other (${found.map((x) => x.type).join(', ')})`);
    }
    /* And the value REACHES the view. It did not: the resolver knew a backtick
     * literal and a template, so an attribute written as a character literal
     * resolved to nothing and the attribute was dropped from the reconstructed
     * view altogether - which is the view the property rules and the render
     * gate then judge. */
    const { prepareAbap } = await import('../../lib/reconstruct.mjs');
    const xmlOf = (lit) => prepareAbap(app(lit)).docs[0] ?? '';
    assert(/title="Net \(total"/.test(xmlOf("'Net (total'")),
      `the character literal reaches the view (${xmlOf("'Net (total'")})`);
    assert(/title="it's"/.test(xmlOf("'it''s'")),
      `a doubled quote inside it is one quote (${xmlOf("'it''s'")})`);
    /* An ABAP text field literal is type C: assigning it to a string drops the
     * trailing blanks, so `'x '` and `'x'` are the same title and `''` is the
     * empty string rather than a blank. */
    assert(/title="Net \(total"/.test(xmlOf("'Net (total   '")),
      `trailing blanks go, as they do on a system (${xmlOf("'Net (total   '")})`);
    assert(/title=""/.test(xmlOf("''")), `'' is the empty string (${xmlOf("''")})`);
    // a variable assigned a character literal resolves the same way
    const viaVar = prepareAbap(app('lv_t').replace('DATA(view) =', "DATA(lv_t) = 'Net (total'.\n      DATA(view) ="));
    assert(/title="Net \(total"/.test(viaVar.docs[0] ?? ''),
      `and through a variable holding one (${viaVar.docs[0]})`);

    /* ---- and the same question asked of every fixture at once ----
     *
     * `n = \`Page\`` and `n = 'Page'` name the same control - the builder takes
     * a `string` and ABAP converts either form to one - so a class rewritten
     * from one literal form into the other has to reconstruct to the SAME
     * view and derive the SAME model. It did not: the chain reader matched
     * only backticks for `n`/`ns`, so every element call came back
     * "unparsed", and the seed readers behind `VALUE #( )` matched only
     * backticks too, so a table seeded the way most ABAP is written derived
     * an EMPTY model - and the render preview, the binding-path rules and the
     * property gate all judged a screen with no data behind it. 45 of the 49
     * fixtures below differed; none do now. */
    const asCharLiterals = (src) => src.split('\n')
      // a comment line is left alone: its apostrophes are prose
      .map((l) => (/^\s*["*]/.test(l) ? l : l.replace(/`([^`\n']*)`/g, (_, inner) => `'${inner}'`)))
      .join('\n');
    let compared = 0;
    for (const name of fs.readdirSync(FIX).filter((x) => x.endsWith('.clas.abap'))) {
      const src = fs.readFileSync(f(name), 'utf8');
      if (!src.includes('`')) continue;
      compared++;
      const a = prepareAbap(src);
      const b = prepareAbap(asCharLiterals(src));
      assert(JSON.stringify(a.docs) === JSON.stringify(b.docs),
        `${name}: the same view, written with character literals\n    ` +
        `${JSON.stringify(a.docs).slice(0, 160)}\n    ${JSON.stringify(b.docs).slice(0, 160)}`);
      assert(JSON.stringify(a.model) === JSON.stringify(b.model),
        `${name}: the same model, seeded with character literals\n    ` +
        `${JSON.stringify(a.model).slice(0, 160)}\n    ${JSON.stringify(b.model).slice(0, 160)}`);
    }
    assert(compared > 40, `enough fixtures to mean something (${compared})`);
});
}
