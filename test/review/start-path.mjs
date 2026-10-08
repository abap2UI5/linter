/*
 * The start path: what the FIRST display of a view shows. See
 * test/review/README.md for the harness.
 *
 * samples-stack app 013 bound a MessageStrip `type` to an attribute only its
 * Save/Test handlers filled. Every start shipped it as "", UI5 refused it
 * (`"" is of type string, expected sap.ui.core.message.MessageType`) and the
 * app terminated - and both gates were green, because the derived model took
 * its seeds from the whole class and rendered the view with the handler's
 * `Error`. The model of a document the first display shows is now seeded
 * from the start path only (initPath( ) in abap-source.mjs), and
 * enum-bound-to-initial-field names the attribute.
 *
 *   1. the fixture: the event-only seed fires; a declared VALUE, a literal
 *      seed and a non-literal write on the start path, an omit_initial bind
 *      and a popup built in an event handler are all silent.
 *   2. the model: initModel / docModels against the class-wide model.
 *   3. the start path itself: the check_on_navigated( )-only chain, an ELSEIF
 *      init arm, the constructor, and a class with no dispatch at all.
 */
export default async function ({ section, assert, f, checkAbapSource, prepareAbap }) {
  const fs = await import('node:fs');
  const opts = { render: false, minUi5: '1.71' };
  const of = (src, type = 'enum-bound-to-initial-field') => checkAbapSource(src, opts).findings.filter((x) => x.type === type);

  /* An app class with one MessageStrip bound to `mv_type`; `main` is the
   * body of main( ), `defs` goes into the PUBLIC SECTION, `methods` after
   * view_display. */
  const app = ({ main, decl = 'DATA mv_type TYPE string.', defs = '', methods = '', bind = 'client->_bind( mv_type )' }) =>
    'CLASS zcl_review_start DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
    + `    ${decl}\n${defs}`
    + '  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n    METHODS view_display.\n    METHODS model_init.\n'
    + 'ENDCLASS.\n\nCLASS zcl_review_start IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n    me->client = client.\n'
    + main
    + '  ENDMETHOD.\n\n  METHOD model_init.\n  ENDMETHOD.\n\n  METHOD view_display.\n'
    + '    DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc`\n'
    + '        )->a( n = `xmlns` v = `sap.m`\n        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n        )->ele( `Page` ).\n'
    + `    page->tag( \`MessageStrip\`\n        )->a( n = \`type\` v = ${bind} ).\n`
    + '    page->tag( `Button`\n        )->a( n = `press` v = client->_event( `TEST` ) ).\n'
    + '    client->view_display( page->stringify( ) ).\n  ENDMETHOD.\n' + methods + 'ENDCLASS.\n';
  const dispatch = (init = '') => '    IF client->check_on_init( ).\n' + init + '      view_display( ).\n'
    + '    ELSEIF client->check_on_navigated( ).\n      view_display( ).\n'
    + '    ELSEIF client->check_on_event( `TEST` ).\n      mv_type = `Error`.\n    ENDIF.\n';

  section('start path: the fixture - one attribute only an event handler fills', () => {
    const src = fs.readFileSync(f('startpath.clas.abap'), 'utf8');
    const hits = of(src);
    assert(hits.length === 1 && hits[0].value === 'RESULT_TYPE',
      `enum-bound-to-initial-field: only the event-only seed is reported (got ${hits.map((x) => x.value).join(', ') || 'none'})`);
    assert(hits[0].severity === 'error' && /ships it as ""/.test(hits[0].message) && /MessageType/.test(hits[0].message),
      'enum-bound-to-initial-field: an error that names the empty string and the enum');
    assert(checkAbapSource(src, opts).findings.length === 1, 'the fixture carries no other finding');
  });

  section('start path: the first display is modelled, the class-wide model is kept', () => {
    const src = fs.readFileSync(f('startpath.clas.abap'), 'utf8');
    const p = prepareAbap(src);
    assert(p.model.RESULT_TYPE === 'Error' && p.initModel.RESULT_TYPE === '',
      'initModel: the handler\'s seed is not borrowed; model keeps the class-wide guess');
    assert(p.initModel.DECLARED_TYPE === 'Information' && p.initModel.SEEDED_TYPE === 'Success',
      'initModel: a declared VALUE and a model_init seed are start values');
    assert(!p.initialFields.has('COMPUTED_TYPE') && p.initialFields.has('RESULT_TYPE'),
      'initialFields: a non-literal write on the start path is a runtime value, not an initial one');
    assert(!('OMITTED_TYPE' in p.initModel), 'initModel: an omit_initial field is left out, as in the render model');
    assert(p.docOnInit.length === 2 && p.docOnInit[0] === true && p.docOnInit[1] === false,
      'docOnInit: the main view is on the start path, the popup built in a handler is not');
    const r = checkAbapSource(src, opts);
    assert(r.docModels[0].RESULT_TYPE === '' && r.docModels[1].POPUP_TYPE === 'Warning',
      'docModels: the render gate gets the start-path model for the first display only');
  });

  section('start path: the shapes of main( ) that reach the first display', () => {
    assert(of(app({ main: dispatch() })).length === 1,
      'check_on_init( ) arm: a seed only in the event arm is reported');
    assert(of(app({ main: dispatch('      mv_type = `Information`.\n') })).length === 0,
      'check_on_init( ) arm: a literal seed in the arm itself is a start value');
    assert(of(app({ main: dispatch('      model_init( ).\n'),
      methods: '' })).length === 1,
    'a called method that seeds nothing seeds nothing');
    assert(of(app({ main: '    IF client->check_on_navigated( ).\n      view_display( ).\n'
      + '    ELSEIF client->check_on_event( `TEST` ).\n      mv_type = `Error`.\n    ENDIF.\n' })).length === 1,
    'a chain with no init arm starts at check_on_navigated( ) - init implies navigated');
    assert(of(app({ main: '    mv_type = `None`.\n' + dispatch() })).length === 0,
      'a statement of main( ) ahead of the dispatch runs on every roundtrip, the first included');
    assert(of(app({ main: dispatch(), decl: 'DATA mv_type TYPE string VALUE `None`.' })).length === 0,
      'a declared VALUE is the start value');
    assert(of(app({ main: dispatch('      mv_type = |{ sy-uname }|.\n') })).length === 0,
      'a template with an interpolation is a runtime value, not judged');
    assert(of(app({ main: dispatch('      SELECT SINGLE type FROM zt INTO @mv_type.\n') })).length === 0,
      'a SELECT … INTO is a write, not judged');
    assert(of(app({ main: dispatch(), bind: 'client->_bind( val = mv_type omit_initial = abap_true )' })).length === 0,
      'omit_initial: the field is not sent, UI5 keeps the default');
    assert(of(app({ main: '    view_display( ).\n    IF client->get_event( ) = `TEST`.\n      mv_type = `Error`.\n    ENDIF.\n' })).length === 0,
      'no dispatch at all: there is no start path to read, so nothing is judged');
    assert(of(app({
      main: dispatch(),
      defs: '    METHODS constructor.\n',
      methods: '\n  METHOD constructor.\n    mv_type = `Success`.\n  ENDMETHOD.\n',
    })).length === 0, 'the constructor runs before the first display');
    assert(of(app({ main: dispatch(), decl: 'DATA mv_type TYPE i.' })).length === 0,
      'a numeric field ships 0, not "" - not this rule');
  });

  section('start path: the render gate sees the first display too', () => {
    const src = app({ main: dispatch() });
    const r = checkAbapSource(src, opts);
    assert(r.docModels.length === 1 && r.docModels[0].MV_TYPE === '' && r.model.MV_TYPE === 'Error',
      'docModels: the start-path model, where the class-wide one borrowed the handler\'s value');
  });
}
