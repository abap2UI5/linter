/*
 * test/sections/views - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { path, test, checkAbapSource, checkFiles, prepareAbap, f, assert, section, by, has, rules, dumps, rows } = H;


// a DATA declared with a NAMED table type is a table too — the inline
// `STANDARD TABLE OF` form is not the only one the corpus writes
section('xmlns', async () => {
    const named = prepareAbap(`CLASS zcl_named DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      TYPES: BEGIN OF ty_s_row, name TYPE string, END OF ty_s_row.
      TYPES ty_t_row TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
      DATA t_rows TYPE ty_t_row.
      DATA t_late TYPE ty_t_row.
  ENDCLASS.
  CLASS zcl_named IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      t_rows = VALUE #( ( name = \`Notebook\` ) ).
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`List\`
              )->a( n = \`items\` v = client->_bind( t_rows )
              )->ele( \`items\`
                  )->tag( \`StandardListItem\`
                      )->a( n = \`title\` v = \`{NAME}\`
          )->end( ).
      v->ele( \`List\` )->a( n = \`items\` v = client->_bind( t_late ) ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`);
    assert(Array.isArray(named.model.T_ROWS) && named.model.T_ROWS[0].NAME === 'Notebook',
      'model: a DATA with a named table type is a table, not a scalar');
    // an UNSEEDED table: the shape keeps a declared row so paths stay judgeable,
    // the render model gets nothing — an invented all-empty row is instantiated
    // by the render gate and then fails strict validation on the first enum
    assert(named.model.T_LATE.length === 0 && named.modelShape.T_LATE.length === 1
      && 'NAME' in named.modelShape.T_LATE[0],
      'model: an unseeded table is empty for the renderer and a declared row in the shape');
});

// _bind with shape-neutral named parameters: omit_initial/omit_initial_paths
// and json change the SERIALIZATION around the binding, not what it addresses,
// so the attribute must reconstruct instead of being dropped as unresolved
section('xmlns (2)', async () => {
    const wrap = (v) => `CLASS zcl_b DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA manifest TYPE string.
  ENDCLASS.
  CLASS zcl_b IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(x) = z2ui5_cl_ui5_view_builder=>factory( ).
      x->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->tag( \`Text\` )->a( n = \`text\` v = ${v}
          )->end( ).
      client->view_display( x->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`;
    const json = prepareAbap(wrap('client->_bind( val = manifest json = abap_true )'));
    assert(json.docs[0]?.includes('text="{/MANIFEST}"') && json.notes.length === 0,
      '_bind( json = abap_true ) reconstructs as the plain binding');
    const omit = prepareAbap(wrap('client->_bind( val = manifest omit_initial_paths = VALUE #( ( `A` ) ( `B` ) ) )'));
    assert(omit.docs[0]?.includes('text="{/MANIFEST}"') && omit.notes.length === 0,
      '_bind( omit_initial_paths = VALUE #( … ) ) reconstructs as the plain binding');
    const mapper = prepareAbap(wrap('client->_bind( val = manifest custom_mapper = mapper )'));
    assert(!mapper.docs[0]?.includes('{/MANIFEST}')
      && mapper.notes.some((n) => n.includes('unresolved value expression')),
      '_bind with a custom mapper stays unresolved — the serialized names are not ours to guess');
});

// omit_initial_paths in the RENDER model: the runtime does not serialize an
// initial value of a listed field, so the mock must not either — the seeded
// '' used to reach strict mode as an empty enum and kill the render
section('xmlns (3)', async () => {
    const om = prepareAbap(`CLASS zcl_o DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      TYPES: BEGIN OF ty_s, text TYPE string, state TYPE string, END OF ty_s.
      DATA t_rows TYPE STANDARD TABLE OF ty_s WITH EMPTY KEY.
  ENDCLASS.
  CLASS zcl_o IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      t_rows = VALUE #( ( text = \`a\` state = \`\` ) ( text = \`b\` state = \`Success\` ) ).
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`List\`
              )->a( n = \`items\` v = client->_bind( val = t_rows omit_initial_paths = VALUE #( ( \`STATE\` ) ) )
              )->ele( \`items\`
                  )->tag( \`ObjectListItem\` )->a( n = \`title\` v = \`{TEXT}\` )->a( n = \`intro\` v = \`{STATE}\` )
          )->end( )->end( )->end( ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`);
    assert(!('STATE' in (om.model.T_ROWS?.[0] ?? { STATE: 1 })) && om.model.T_ROWS?.[1]?.STATE === 'Success',
      'omit_initial_paths: the initial value is dropped from the render model, the filled one kept');
    assert('STATE' in (om.modelShape.T_ROWS?.[0] ?? {}),
      'omit_initial_paths: the shape keeps the field, so binding paths stay judgeable');
});

// no row shape, no verdict: a table of a type the class does not declare
// could have any field, so nothing there is reported
const opaque = `CLASS zcl_x DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA t_flights TYPE STANDARD TABLE OF sflight.
ENDCLASS.
CLASS zcl_x IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`List\`
            )->a( n = \`items\` v = client->_bind( t_flights )
            )->ele( \`items\`
                )->tag( \`StandardListItem\`
                    )->a( n = \`title\` v = \`{ANYTHING_AT_ALL}\`
        )->end( )->end( )->end( ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;
section('rows (2)', async () => {
  assert(!checkAbapSource(opaque, { render: false }).findings
    .some((x) => x.type === 'unknown-binding-path'),
    'rows: nothing is claimed about a row type the class does not declare');
});

/* The CELL binding — `_bind( val = t[ n ]-field tab = t tab_index = n )`, one
 * row of an internal table addressed from a statically written control. It
 * fell through to "unresolved" until the reconstructor learned it, and an
 * unresolved value takes its ATTRIBUTE out of the reconstructed view, so
 * every gate stopped seeing the property (the same shape as the earlier
 * omit_initial_paths/json gap). What is asserted here is both halves: the
 * consistent call resolves to the row-qualified path, and every form whose
 * three parts disagree stays unresolved rather than resolving to a guess. */
const cellClass = (bindExpr) => `CLASS zcl_cell DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_emp, name TYPE string, job TYPE string, END OF ty_s_emp.
    DATA mt_emp TYPE STANDARD TABLE OF ty_s_emp WITH EMPTY KEY.
    DATA mv_row TYPE i.
ENDCLASS.
CLASS zcl_cell IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    mt_emp = VALUE #( ( name = \`Michael Adams\` job = \`Scrum Master\` )
                      ( name = \`John Miller\` job = \`Product Owner\` ) ).
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`Label\`
            )->a( n = \`text\` v = ${bindExpr}
        )->end( ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;

section('cell binding', async () => {
  const first = prepareAbap(cellClass('client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = 1 )'));
  assert(first.docs[0]?.includes('text="{/MT_EMP/0/NAME}"') && first.notes.length === 0,
    'cell binding: ABAP row 1 is client row 0, and the attribute stays in the view');
  const second = prepareAbap(cellClass('client->_bind( val = mt_emp[ 2 ]-job tab = mt_emp tab_index = 2 )'));
  assert(second.docs[0]?.includes('text="{/MT_EMP/1/JOB}"'),
    'cell binding: the row index and the component are both resolved, not guessed');
  const bare = prepareAbap(cellClass('client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = 1 path = abap_true )'));
  assert(bare.docs[0]?.includes('text="/MT_EMP/0/NAME"'),
    'cell binding: path = abap_true still asks for the bare path');
  const me = prepareAbap(cellClass('client->_bind( val = me->mt_emp[ 1 ]-name tab = me->mt_emp tab_index = 1 )'));
  assert(me.docs[0]?.includes('text="{/MT_EMP/0/NAME}"'),
    'cell binding: a me-> prefix drops away on both arguments');

  // the table becomes a bound root, so the row shape is known and the
  // row-qualified path is judged like any other rather than reported missing
  assert(Array.isArray(first.model.MT_EMP) && first.model.MT_EMP[0]?.NAME === 'Michael Adams',
    'cell binding: the TABLE is what the model carries — the cell is only a path into it');
  assert(!checkAbapSource(cellClass('client->_bind( val = mt_emp[ 2 ]-job tab = mt_emp tab_index = 2 )'),
    { render: false }).findings.some((x) => x.type === 'unknown-binding-path'),
    'cell binding: a resolved cell path is not reported as unknown');

  // the three parts disagree -> the call cannot work (the framework matches
  // the cell by REFERENCE and refuses a val outside the addressed row), so a
  // path computed from it would be a guess printed as a fact
  const guessable = [
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = 2 )', 'the row in val and tab_index disagree'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_other tab_index = 1 )', 'val reads a table other than tab'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = mv_row )', 'the row number is not a literal'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp )', 'tab_index is missing'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab_index = 1 )', 'tab is missing'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = 1 switch_default_model = abap_true )',
      'a re-rooted model is still not ours to guess'],
  ];
  for (const [expr, why] of guessable) {
    const out = prepareAbap(cellClass(expr));
    assert(!out.docs[0]?.includes('{/MT_EMP/')
      && out.notes.some((n) => n.includes('unresolved value expression')),
      `cell binding: stays unresolved when ${why}`);
  }

  /* The ASSIGNED-row spelling — `val = <emp>-name` — is what a downported
   * class writes, so it is the one the corpus uses. `val` contributes the
   * component; the table and the row come from tab/tab_index either way. */
  const assigned = prepareAbap(`CLASS zcl_cell DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_emp, name TYPE string, job TYPE string, END OF ty_s_emp.
    DATA mt_emp TYPE STANDARD TABLE OF ty_s_emp WITH EMPTY KEY.
ENDCLASS.
CLASS zcl_cell IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    FIELD-SYMBOLS <emp1> TYPE ty_s_emp.
    FIELD-SYMBOLS <emp2> TYPE ty_s_emp.
    mt_emp = VALUE #( ( name = \`Michael Adams\` job = \`Scrum Master\` )
                      ( name = \`John Miller\` job = \`Product Owner\` ) ).
    ASSIGN mt_emp[ 1 ] TO <emp1>.
    ASSIGN mt_emp[ 2 ] TO <emp2>.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`Label\`
            )->a( n = \`text\` v = client->_bind( val = <emp1>-name tab = mt_emp tab_index = 1 )
        )->tag( \`Label\`
            )->a( n = \`text\` v = client->_bind( val = <emp2>-job tab = mt_emp tab_index = 2 )
        )->end( ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`);
  assert(assigned.docs[0]?.includes('text="{/MT_EMP/0/NAME}"')
    && assigned.docs[0]?.includes('text="{/MT_EMP/1/JOB}"')
    && assigned.notes.length === 0,
    'cell binding: an assigned row resolves from tab/tab_index plus the component');
  assert(assigned.model.MT_EMP?.[1]?.JOB === 'Product Owner',
    'cell binding: the assigned form binds the table into the model like the other one');
});

// event parameters an app reads back ($parameters>/name) are members of the
// control like any other - and they are resolved PER EVENT, because two
// events of one control can declare the same name with different histories
const withEvent = (control, event, param) => checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->tag( \`${control}\`
          )->a( n = \`${event}\` v = client->_event( val = \`GO\` t_arg = VALUE #( ( \`\${$parameters>/${param}}\` ) ) ) ).
  client->view_display( view->stringify( ) ).`, { render: false })
  .findings.filter((x) => x.type === 'event-parameter-too-new');

section('event params', async () => {
  assert(withEvent('SearchField', 'search', 'searchButtonPressed')
    .some((x) => x.member === 'searchButtonPressed' && x.since === '1.114'),
    'event params: one newer than the floor is reported');
  assert(!withEvent('SearchField', 'search', 'query').length,
    'event params: one without an @since predates version tracking and is not');
  assert(withEvent('Menu', 'beforeClose', 'item').length === 1,
    'event params: Menu beforeClose/item is @since 1.136');
  assert(!withEvent('Menu', 'itemSelected', 'item').length,
    'event params: Menu itemSelected/item is NOT - same name, different event, and only the flat member map confuses the two');
});

// an aggregation directly inside another aggregation: invalid XML, and the
// signature of a missing shut( ) - the port that put <footer> inside <columns>
// only ever surfaced as "failed to load sap/ui/table/footer.js" in the browser
const view = (inner) => `
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:my\`  v = \`my.custom.lib\`
      ${inner}.
  client->view_display( view->stringify( ) ).`;
const misplaced = (src) => checkAbapSource(src, { render: false })
  .findings.filter((x) => x.type === 'aggregation-in-aggregation');

section('missing shut', async () => {
  assert(misplaced(view('  )->ele( `Table` )->ele( `columns` )->tag( `Column` )->ele( `footer` )'))
    .some((x) => x.member === 'footer' && x.parentAggregation === 'columns'),
    'missing shut: an aggregation inside an aggregation is reported');
  assert(!misplaced(view('  )->ele( `Table` )->ele( `columns` )->ele( `Column` )->ele( `header` )')).length,
    'missing shut: a well-formed aggregation/control/aggregation nesting is not');
  assert(!misplaced(view('  )->ele( `Table` )->ele( `columns` )->ele( n = `Thing` ns = `my` )->ele( `content` )')).length,
    'missing shut: a control from an unknown library still counts as a control in between');
});

// a control the aggregation's type does not accept: UI5 refuses the child and
// the part of the view below it silently disappears
const childOf = (inner) => checkAbapSource(view(inner), { render: false })
  .findings.filter((x) => x.type === 'invalid-aggregation-child');
section('aggregation child', async () => {
  assert(childOf('  )->ele( `Table` )->ele( `columns` )->tag( `Button` )')
    .some((x) => x.control === 'sap.m.Button' && x.parentControl === 'sap.m.Table'
      && x.member === 'columns' && x.expected === 'sap.m.Column'),
    'aggregation child: a Button inside Table columns is reported with the expected type');
  assert(!childOf('  )->ele( `Table` )->ele( `columns` )->tag( `Column` )').length,
    'aggregation child: the type the aggregation declares is accepted');
});

/* ------------------------------------------------ negative counter-cases ----
 *
 * The doctrine is a fixture proving a rule sees its own defect AND leaves the
 * neighbouring legal form alone, and eight rules had only the first half. A
 * rule asserted in one direction can be a rule that fires on everything: the
 * positive case passes either way, and the corpus is where that gets found
 * out - late, on somebody else's repository.
 *
 * Each pair below is the same view twice, defective and correct, differing in
 * the one thing the rule is about.
 */
section('too-many-children', async () => {
    const only = (src, type) => checkAbapSource(src, { render: false })
      .findings.filter((x) => x.type === type);
    const sees = (inner, type) => only(view(inner), type).length > 0;
    const quiet = (inner, type) => only(view(inner), type).length === 0;

    // too-many-children: a 0..1 aggregation given two. The second silently
    // replaces the first at runtime.
    assert(sees('  )->ele( `Page` )->ele( `customHeader` )->tag( `Bar` )->tag( `Bar` )', 'too-many-children'),
      'too-many-children: two children in a 0..1 aggregation are reported');
    assert(quiet('  )->ele( `Page` )->ele( `customHeader` )->tag( `Bar` )', 'too-many-children'),
      'too-many-children: …and one is not');
    assert(quiet('  )->ele( `Page` )->ele( `content` )->tag( `Button` )->tag( `Button` )', 'too-many-children'),
      'too-many-children: a 0..n aggregation takes as many as it likes');

    // excess-shut: end( ) past the root - the builder ASSERTs, so the app dumps.
    assert(sees('  )->ele( `Page` )->tag( `Button` )->end( )->end( )->end( )->end( )', 'excess-shut'),
      'excess-shut: closing past the root is reported');
    assert(quiet('  )->ele( `Page` )->tag( `Button` )->end( )->end( )', 'excess-shut'),
      'excess-shut: …and a chain that closes exactly what it opened is not');

    // duplicate-aggregation: the same aggregation opened twice under ONE control.
    assert(sees('  )->ele( `Page` )->ele( `content` )->tag( `Button` )->end( )->ele( `content` )->tag( `Text` )', 'duplicate-aggregation'),
      'duplicate-aggregation: one control opening the same aggregation twice is reported');
    assert(quiet('  )->ele( `Page` )->ele( `content` )->tag( `Button` )->end( )->ele( `footer` )->tag( `Bar` )', 'duplicate-aggregation'),
      'duplicate-aggregation: …and two DIFFERENT aggregations are not');
    assert(quiet('  )->ele( `Page` )->ele( `content` )->ele( `Panel` )->ele( `content` )->tag( `Button` )', 'duplicate-aggregation'),
      'duplicate-aggregation: …nor the same aggregation name on a NESTED control - it belongs to its own parent');

    // attribute-without-element: a( ) with nothing to attach it to. dumps.clas
    // carries the positive; this is the legal form beside it.
    assert(quiet('  )->ele( `Page` )->a( n = `title` v = `Hi` )', 'attribute-without-element'),
      'attribute-without-element: an attribute on an element that exists is not reported');

    // binding-for-event / event-for-property: two halves of one matrix - a
    // binding written into an event slot, and a handler written into a property.
    assert(sees('  )->ele( `Page` )->tag( `Button` )->a( n = `press` v = `{/NAME}` )', 'binding-for-event'),
      'binding-for-event: a {binding} on an event slot is reported');
    assert(quiet('  )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `{/NAME}` )', 'binding-for-event'),
      'binding-for-event: …and the identical binding on a PROPERTY is not');
    assert(sees('  )->ele( `Page` )->tag( `Button` )->a( n = `tooltip` v = client->_event( `GO` ) )', 'event-for-property'),
      'event-for-property: a handler written into a property slot is reported');
    assert(quiet('  )->ele( `Page` )->tag( `Button` )->a( n = `press` v = client->_event( `GO` ) )', 'event-for-property'),
      'event-for-property: …and the identical handler on the EVENT is not');

    // json-literal-in-attribute: UI5 reads a leading { as a binding, so a raw
    // JSON object never reaches the property.
    assert(sees('  )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `{"a":1}` )', 'json-literal-in-attribute'),
      'json-literal-in-attribute: a raw JSON object in an attribute is reported');
    assert(quiet('  )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `{/NAME}` )', 'json-literal-in-attribute'),
      'json-literal-in-attribute: …and an ordinary binding, the shape it has to tell apart, is not');

    /* collection-bound-to-property needs the CLASS, not just the chain: the rule
     * asks the derived model whether the bound name is a table, so a bare view
     * would leave it silent for the wrong reason. */
    const bound = (member, name) => `CLASS zcl_neg DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA name TYPE string.
      DATA tab TYPE STANDARD TABLE OF string WITH EMPTY KEY.
  ENDCLASS.
  CLASS zcl_neg IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      view->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\`     v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`Page\`
            )->ele( \`Table\`
              )->a( n = \`${member}\` v = client->_bind( ${name} ) ).
      client->view_display( view->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`;
    assert(only(bound('headerText', 'tab'), 'collection-bound-to-property').length === 1,
      'collection-bound-to-property: a table bound to a scalar property is reported');
    assert(only(bound('headerText', 'name'), 'collection-bound-to-property').length === 0,
      'collection-bound-to-property: …and a scalar bound to the same property is not');
    assert(only(bound('items', 'tab'), 'collection-bound-to-property').length === 0,
      'collection-bound-to-property: …nor the same table bound to the AGGREGATION it belongs in');
});

// levels left open at stringify( ) are harmless (render( ) closes the tree) -
// a note for --verbose, never a finding
section('open levels', async () => {
    const open = prepareAbap(view('  )->ele( `Page` )->tag( `Button` )'));
    assert(open.notes.some((n) => /level\(s\) left open/.test(n)),
      'open levels: an unshut tree at stringify( ) is noted');
    assert(!checkAbapSource(view('  )->ele( `Page` )->tag( `Button` )'), { render: false })
      .findings.some((x) => x.type === 'open-levels'),
      'open levels: the note never becomes a finding');
});

// a tag in a foreign namespace (raw XHTML, a custom-control library) is not
// a UI5 aggregation of its parent - it is outside what the metadata can judge
const foreign = checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`      v = \`sap.m\`
      )->a( n = \`xmlns:mvc\`  v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:html\` v = \`http://www.w3.org/1999/xhtml\`
      )->ele( \`Panel\`
          )->tag( n = \`iframe\` ns = \`html\`
              )->a( n = \`src\` v = \`https://example.org\` ).
  client->view_display( view->stringify( ) ).`, { render: false });
section('foreign namespace', async () => {
  assert(!foreign.findings.some((x) => x.type === 'unknown-aggregation'),
    'foreign namespace: html:iframe is left alone, not read as an aggregation of Panel');
});

/* A SAP control the snapshot does not carry - a SAPUI5-only library, judged
 * under --distribution sapui5 so it is not reported as sapui5-only either.
 * Its own aggregation was blamed on the nearest KNOWN ancestor: `vos` inside
 * `vbm:AnalyticMap` came out as "sap.m.Page has no aggregation vos", which is
 * a finding no author can act on. `samples-stack` excluded a whole package to
 * silence the same shape. The mirror image was worse and invisible: an
 * aggregation whose name happens to exist on that ancestor was silently
 * excused. */
const opaqueOwner = checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:vbm\` v = \`sap.ui.vbm\`
      )->ele( \`Page\`
          )->ele( n = \`AnalyticMap\` ns = \`vbm\`
              )->ele( n = \`vos\` ns = \`vbm\`
                  )->tag( n = \`Spot\` ns = \`vbm\`
                      )->a( n = \`position\` v = \`0;0;0\` ).
  client->view_display( view->stringify( ) ).
`, { render: false, distribution: 'sapui5' });
section('opaque control', async () => {
  assert(!opaqueOwner.findings.some((x) => x.type === 'unknown-aggregation'),
    `opaque control: vos belongs to vbm:AnalyticMap, not to the Page above it (got ${
      opaqueOwner.findings.map((x) => `${x.type} ${x.control}/${x.member}`).join(', ') || 'nothing'})`);
  assert(!opaqueOwner.findings.length,
    `opaque control: nothing under an unjudgeable control is judged (${
      opaqueOwner.findings.map((x) => x.type).join(', ') || 'none'})`);
});

/* An XML prefix is an NCName: a dot is legal in it, and the sap.viz controls
 * are written with `xmlns:viz.data` / `xmlns:viz.feeds`. Matching the prefix
 * with \w alone read those declarations as absent and then reported every use
 * of them as undeclared-namespace - four errors on one correct class. */
const dottedNs = checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`          v = \`sap.m\`
      )->a( n = \`xmlns:mvc\`      v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:viz.data\` v = \`sap.viz.ui5.data\`
      )->ele( \`Page\`
          )->tag( n = \`FlattenedDataset\` ns = \`viz.data\` ).
  client->view_display( view->stringify( ) ).`, { render: false, distribution: 'sapui5' });
section('dotted prefix', async () => {
  assert(!dottedNs.findings.some((x) => x.type === 'undeclared-namespace'),
    `dotted prefix: xmlns:viz.data is a declaration (got ${
      dottedNs.findings.map((x) => `${x.type} ${x.member ?? ''}`).join(', ') || 'nothing'})`);
});

// positions in raw XML are just as exact as in a builder class
const xmlPos = (await checkFiles([f('badvalue.view.xml')], { render: false }))[0];
const bad = xmlPos.findings.find((x) => x.type === "invalid-property-value");
section('xml', async () => {
  assert(bad?.line === 4 && bad?.column === 15,
    `xml: the invalid value is located at 4:15 (got ${bad?.line}:${bad?.column})`);
});

const xml = by('sample.view.xml');
section('xml (2)', async () => {
  assert(xml.kind === 'xml', 'xml: raw view detected');
  assert(xml.findings.length === 0, 'xml: no property findings');
  assert(xml.renderErrors.length === 0, `xml: renders clean (${xml.renderErrors[0] || ''})`);
});

  Object.assign(H, { opaque, cellClass, withEvent, view, misplaced, childOf, foreign, opaqueOwner, dottedNs, xmlPos, bad, xml });
}
