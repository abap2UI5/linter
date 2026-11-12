/*
 * test/sections/app-rules - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, os, path, test, after, checkAbapSource, checkXmlSource, produced, prepareAbap, elementBoundSlots, severityOf, f, assert, section, tempDir, by, good, broken, has, rules, rows, nested, view, foreign, bad, xml } = H;


// -------------------------------------------------------------- new rules ----
// display-root-mismatch, binding-type-mismatch, event-arg-out-of-range
section('display-root-mismatch', async () => {
    const { checkAbapRules, namedModels } = await import('../observe.mjs');
    const { deniedControlMethod } = await import('../../lib/frontend-actions.mjs');
    const roots = checkAbapSource(fs.readFileSync(f('roots.clas.abap'), 'utf8'));
    const mismatches = roots.findings.filter((x) => x.type === 'display-root-mismatch');
    assert(mismatches.length === 2,
      `display-root-mismatch: both directions reported (got ${mismatches.length})`);
    assert(mismatches.some((x) => x.member === 'popup_display' && x.value === 'mvc:View'),
      'display-root-mismatch: a mvc:View handed to the popup slot');
    assert(mismatches.some((x) => x.member === 'view_display' && x.value === 'core:FragmentDefinition'),
      'display-root-mismatch: a core:FragmentDefinition handed to the view slot');
    assert(!checkAbapSource(fs.readFileSync(f('good.clas.abap'), 'utf8')).findings
      .some((x) => x.type === 'display-root-mismatch'),
      'display-root-mismatch: a matching pair is not reported');

    /* The rule used to live only in the handle-aware extractor, so a LINEARLY
     * built class - the very shape the rule's own doc uses as its example -
     * was never judged. roots.clas.abap builds through handles; this is the
     * other idiom, the whole document in one statement. */
    const linear = checkAbapSource(`
    client->popup_display( z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`Text\` )->a( n = \`text\` v = \`x\` )->stringify( ) ).`);
    assert(linear.findings.some((x) => x.type === 'display-root-mismatch'
        && x.member === 'popup_display' && x.value === 'mvc:View'),
      'display-root-mismatch: reported on a linearly built class too, not only a handle-built one');

    const typed = checkAbapSource(fs.readFileSync(f('typedbind.clas.abap'), 'utf8'));
    const mism = typed.findings.filter((x) => x.type === 'binding-type-mismatch');
    assert(mism.map((x) => x.memberType).sort().join() === 'boolean,float,int',
      `binding-type-mismatch: a TYPE string field on a float, an int and a boolean property (got ${mism.map((x) => x.memberType).join() || 'none'})`);
    assert(!mism.some((x) => x.value === 'REAL_NUM'),
      'binding-type-mismatch: a numeric ABAP type on a numeric property is not reported');

    const arity = typed.findings.filter((x) => x.type === 'event-arg-out-of-range');
    assert(arity.length === 2, `event-arg-out-of-range: two reads past the end (got ${arity.length})`);
    assert(arity.some((x) => x.value === 'PICK' && x.member === '2' && x.count === 1),
      'event-arg-out-of-range: arg 2 of an event that sends one');
    assert(arity.some((x) => x.value === 'PLAIN' && x.member === '1' && x.count === 0),
      'event-arg-out-of-range: the default arg of an event that sends none');
    assert(!arity.some((x) => x.member === '1' && x.value === 'PICK'),
      'event-arg-out-of-range: a read inside the declared arity is not reported');

    /* The `arg` shorthand counts toward the arity. abap2UI5's client folds
     * `arg = x` into the same string_table as `t_arg = VALUE #( ( x ) )`, so a
     * wire spelling its one argument that way sends one - reading the t_arg
     * region alone made every such wire look like it sent nothing, which was
     * 187 false positives in 125 files the day the samples-controls corpus
     * adopted the shorthand. */
    /* checkAbapRules, not checkAbapSource: a snippet without a builder chain
     * never reaches the ABAP rules at all - the same trap the abap rules (2)
     * section documents, and the reason these assertions would otherwise be
     * green for the wrong reason. */
    const { checkAbapRules: argRules } = await import('../observe.mjs');
    const argEvent = (raise, read) => argRules(`CLASS x IMPLEMENTATION.
    METHOD view.
      ${raise}
    ENDMETHOD.
    METHOD on_event.
      CASE client->get( )-event.
        WHEN \`PICK\`.
          DATA(v) = client->get_event_arg( ${read} ).
      ENDCASE.
    ENDMETHOD.
    ENDCLASS.`).filter((x) => x.type === 'event-arg-out-of-range');

    assert(argEvent('client->_event( val = `PICK` arg = `${$source>/key}` ).', '1').length === 0,
      'event-arg-out-of-range: arg = counts as one argument, so reading 1 is in range');
    assert(argEvent('client->_event( val = `PICK` arg = `${$source>/key}` ).', '2').length === 1,
      'event-arg-out-of-range: reading past a single arg = is still reported');
    assert(argEvent('client->_event( val = `PICK` t_arg = VALUE #( ( `${a}` ) ) arg = `${b}` ).', '2').length === 0,
      'event-arg-out-of-range: arg appends behind t_arg, so the two compose to arity 2');
    assert(argEvent('client->_event( val = `PICK` arg = lv_key ).', '1').length === 0,
      'event-arg-out-of-range: a non-literal arg is still one argument, not a skipped one');
    assert(argEvent('client->_event( val = `PICK` ).', '1').length === 1,
      'event-arg-out-of-range: an event that really sends nothing is unaffected');

    /* and the unresolved-brace rule keeps its coverage across the shorthand -
     * a bare {COL} arrives empty whichever parameter carried it */
    const argBrace = argRules('CLASS x IMPLEMENTATION. METHOD view.'
      + ' client->_event( val = `PICK` arg = `{COL}` ). ENDMETHOD. ENDCLASS.')
      .filter((x) => x.type === 'event-arg-unresolved');
    assert(argBrace.length === 1 && argBrace[0].value === '{COL}',
      `event-arg-unresolved: a bare brace in arg = is reported like one in t_arg (got ${argBrace.length})`);

    // the two shapes that were false positives on the corpus
    const foreign = `CLASS x IMPLEMENTATION.
    METHOD main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`GO\` ) ).
      CASE client->get_event( ).
        WHEN \`GO\`.
          client->message_box_display( onclose = \`CLOSED\` ).
        WHEN \`CLOSED\`.
          IF client->get_event_arg( ) = \`YES\`.
          ENDIF.
      ENDCASE.
    ENDMETHOD.
    METHOD other.
      client->popover_display( by_id = client->get_event_arg( ) ).
    ENDMETHOD.
  ENDCLASS.`;
    const none = checkAbapRules(foreign).filter((x) => x.type === 'event-arg-out-of-range');
    assert(none.length === 0,
      `event-arg-out-of-range: an event the class does not raise, and a read in another method, are not judged (got ${none.length})`);

    // --- an imperative setter where the control has a bindable property -------
    const setters = checkAbapSource(fs.readFileSync(f('setters.clas.abap'), 'utf8'))
      .findings.filter((x) => x.type === 'settable-property-via-action');
    assert(setters.length === 1 && setters[0].member === 'expanded' && setters[0].control === 'sap.m.Panel',
      `settable-property-via-action: only the bindable property is reported (got ${setters.map((x) => `${x.control}.${x.member}`).join() || 'none'})`);
    assert(!setters.some((x) => x.member === 'selectedSection'),
      'settable-property-via-action: an association cannot be bound and is never reported');
    assert(!setters.some((x) => x.member === 'asyncURLHandler'),
      'settable-property-via-action: a function-typed property cannot travel in a JSON model');

    // --- the inverse: a setter no binding can carry, issued off the display path
    const rebuild = checkAbapSource(fs.readFileSync(f('rebuildstate.clas.abap'), 'utf8'))
      .findings.filter((x) => x.type === 'control-state-lost-on-rebuild');
    const rebuiltAt = (id, m) => rebuild.find((x) => x.value === id && x.member === m);
    assert(rebuild.length === 2,
      `control-state-lost-on-rebuild: two wires survive no rebuild (got ${rebuild.map((x) => `${x.value}.${x.member}`).join() || 'none'})`);
    assert(rebuiltAt('objectPage', 'setSelectedSection')?.control === 'sap.uxap.ObjectPageLayout',
      'control-state-lost-on-rebuild: an ASSOCIATION cannot be bound, so re-issuing is the only remedy');
    assert(rebuiltAt('badged', 'setBadgeMinValue')?.control === 'sap.m.Button',
      'control-state-lost-on-rebuild: a method that is no member at all (Button keeps the badge bounds in private fields)');
    assert(!rebuild.some((x) => x.member === 'setNextStep'),
      'control-state-lost-on-rebuild: the same id+setter re-issued from view_display( ) is silent');
    assert(!rebuild.some((x) => x.member === 'setActivePage'),
      'control-state-lost-on-rebuild: a helper view_display( ) calls is ON the display path');
    assert(!rebuild.some((x) => x.member === 'setExpanded'),
      'control-state-lost-on-rebuild: a bindable property belongs to settable-property-via-action');
    assert(!rebuild.some((x) => x.member === 'setCurrentStep'),
      'control-state-lost-on-rebuild: a LITERAL value carries no class state for the rebuild to contradict');
    assert(!rebuild.some((x) => x.member === 'focus'),
      'control-state-lost-on-rebuild: only a set…( ) is judged');
    const setterFixture = checkAbapSource(fs.readFileSync(f('setters.clas.abap'), 'utf8'))
      .findings.filter((x) => x.type === 'control-state-lost-on-rebuild');
    assert(setterFixture.length === 0,
      `control-state-lost-on-rebuild: the sibling rule's fixture sets only CONSTANTS (got ${setterFixture.length})`);

    // --- the three silent wires: denied method, bound association, named model
    const wires = checkAbapSource(fs.readFileSync(f('wires.clas.abap'), 'utf8')).findings;

    const denied = wires.filter((x) => x.type === 'denied-control-method');
    assert(denied.length === 3, `denied-control-method: the three denied wires (got ${denied.map((x) => x.value).join() || 'none'})`);
    assert(denied.some((x) => x.value === 'destroy' && x.member === 'destroy'),
      'denied-control-method: destroy is denied by exact name');
    assert(denied.some((x) => x.value === 'addAggregation'),
      'denied-control-method: the generic reflection mutators are denied');
    assert(denied.some((x) => x.value === 'bindProperty' && x.member === 'bind'),
      'denied-control-method: the finding names the PREFIX that matched, not the method');
    assert(!denied.some((x) => x.value === 'removeAllContent'),
      'denied-control-method: a NAMED per-aggregation mutator is allowed by the runtime and never reported');
    assert(deniedControlMethod('removeAllItems') === null && deniedControlMethod('destroyContent') === null,
      'denied-control-method: the removeAll/destroy prefixes match no named method');
    assert(deniedControlMethod('removeAllAggregation') === 'removeAllAggregation',
      'denied-control-method: the generic form of the same name IS denied');

    const assoc = wires.filter((x) => x.type === 'binding-on-association');
    assert(assoc.length === 1 && assoc[0].member === 'selectedSection',
      `binding-on-association: the bound association is reported (got ${assoc.map((x) => x.member).join() || 'none'})`);

    const models = wires.filter((x) => x.type === 'unknown-model');
    assert(models.length === 2 && models.every((x) => ['i18n', 'ui'].includes(x.value)),
      `unknown-model: only the two models the app does not have (got ${models.map((x) => x.value).join() || 'none'})`);
    assert(!models.some((x) => ['device', 'message', 'http'].includes(x.value)),
      'unknown-model: the framework models are on every view slot');
    assert(!models.some((x) => x.value === 'srv'),
      'unknown-model: a model the class registers with SET_ODATA_MODEL is available');
    assert(namedModels('client->_event_client( val = client->cs_event-set_odata_model t_arg = VALUE #( ( url ) ( name ) ) ).') === null,
      'unknown-model: a class registering a model under a non-literal name is not judged at all');

    // --- a relative binding with no context to resolve against ----------------
    const orphan = checkAbapSource(fs.readFileSync(f('orphanbind.clas.abap'), 'utf8'))
      .findings.filter((x) => x.type === 'relative-binding-without-context');
    const at = (control, member) => orphan.filter((x) => x.control === control && x.member === member)
      .map((x) => x.value).sort().join();
    assert(at('sap.m.Text', 'text') === 'NAME',
      `relative-binding-without-context: the contextless root field is reported (got ${at('sap.m.Text', 'text') || 'none'})`);
    /* The four shapes a PROPERTY binding takes. Only the first was judged until
     * samples-controls app 592 shipped 42 dead address bindings in the second:
     * `{STREET} {HOUSENUMBER}` is two relative paths in one attribute, and the
     * anchored ^{NAME}$ matcher the rule started on could see neither. */
    assert(at('sap.m.Title', 'text') === 'NAME,SUPPLIER',
      `relative-binding-without-context: a COMPOSITE binding is reported once per path - app 592's literal shape (got ${at('sap.m.Title', 'text') || 'none'})`);
    assert(at('sap.m.ObjectNumber', 'number') === 'PRICE',
      `relative-binding-without-context: the COMPLEX form on a property, which only the aggregation branch used to match (got ${at('sap.m.ObjectNumber', 'number') || 'none'})`);
    assert(at('sap.m.ObjectStatus', 'text') === 'STATUS',
      `relative-binding-without-context: an EXPRESSION binding resolves its embedded paths against the same missing context (got ${at('sap.m.ObjectStatus', 'text') || 'none'})`);
    assert(at('sap.m.Label', 'text') === 'NOSUCHFIELD',
      `relative-binding-without-context: a relative name the model root does not have is dead too - it used to fall between this rule and unknown-binding-path, whose relative arm needs a context to check against (got ${at('sap.m.Label', 'text') || 'none'})`);
    assert(!orphan.some((x) => x.control === 'sap.ui.table.RowSettings'),
      'relative-binding-without-context: a per-row template aggregation is not only `template` - rowSettingsTemplate is cloned per row the same way');
    assert(!orphan.some((x) => x.control === 'sap.m.Text' && x.value === 'PRODUCTID'),
      'relative-binding-without-context: a `binding` attribute IS a context - XMLTemplateProcessor hands it to bindObject( ), the declarative cs_event-bind_element');
    assert(!orphan.some((x) => ['0', '1'].includes(String(x.value)) || String(x.value).includes('device')),
      'relative-binding-without-context: a message placeholder and a named model are neither of them a relative path');
    assert(orphan.length === 6,
      `relative-binding-without-context: nothing else in the fixture is reported (got ${orphan.map((x) => `${x.control}.${x.member}=${x.value}`).join(' ') || 'none'})`);
    assert(!checkAbapSource(fs.readFileSync(f('rowpaths.clas.abap'), 'utf8'))
      .findings.some((x) => x.type === 'relative-binding-without-context'),
      'relative-binding-without-context: a relative binding inside a bound aggregation is not judged');

    /* The same promise across a FOREIGN namespace. A custom control is in no
     * UI5 snapshot, and the walk declines to look into a non-`sap.` namespace
     * at all - it used to hand the children nothing, so a bound custom
     * control's row template was judged contextless and both of its
     * attributes reported (abap2UI5/samples app 306, a z2ui5:CameraSelector,
     * which extends sap.m.ComboBox and inherits its `items`). The companion
     * controls lib/cc-controls.mjs mirrors are judged over their base class
     * since 2026-09-27, so the CameraSelector takes the ComboBox's own path
     * now, and an in-house control keeps this one: both are asked. */
    for (const [label, ns, uri, tag] of [
      ['a mirrored companion control', 'z2ui5', 'z2ui5.cc', 'CameraSelector'],
      ['a control in a foreign namespace', 'app', 'zmy.controls', 'DeviceSelect'],
    ]) {
      const foreign = `CLASS x DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA devices TYPE string_table.
  ENDCLASS.
  CLASS x IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->a( n = \`xmlns:core\` v = \`sap.ui.core\`
          )->a( n = \`xmlns:${ns}\` v = \`${uri}\`
          )->ele( n = \`${tag}\` ns = \`${ns}\`
              )->a( n = \`items\` v = \`{path:'/DEVICES'}\`
              )->tag( n = \`Item\` ns = \`core\`
                  )->a( n = \`key\` v = \`{KEY}\`
                  )->a( n = \`text\` v = \`{TEXT}\` ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`;
      const rows = checkAbapSource(foreign).findings
        .filter((x) => x.type === 'relative-binding-without-context');
      assert(rows.length === 0,
        `relative-binding-without-context: ${label} that binds still makes its children rows (got ${rows.map((x) => `${x.member}=${x.value}`).join(' ') || 'none'})`);

      /* …and the widening is not "a foreign tag silences the rule". With no
       * binding on it there is no row context, and the children are reported
       * exactly as before. */
      const unbound = checkAbapSource(foreign.replace("v = \`{path:'/DEVICES'}\`", 'v = \`plain\`')).findings
        .filter((x) => x.type === 'relative-binding-without-context');
      assert(unbound.length === 2,
        `relative-binding-without-context: ${label} that binds nothing opens no context, so its children are still judged (got ${unbound.length})`);
    }
    {
      const agg = checkAbapSource(fs.readFileSync(f('orphanbind.clas.abap'), 'utf8'))
        .findings.filter((x) => x.type === 'relative-aggregation-without-context');
      assert(agg.length === 1 && agg[0].value === 'T_ROWS',
        `relative-aggregation-without-context: only the root-level one is reported (got ${agg.map((x) => x.value).join() || 'none'})`);
      assert(!checkAbapSource(fs.readFileSync(f('rowpaths.clas.abap'), 'utf8'))
        .findings.some((x) => x.type === 'relative-aggregation-without-context'),
        'relative-aggregation-without-context: a relative aggregation inside a row template is the normal form');
      assert(!agg.some((x) => String(x.value).includes('message')),
        'relative-aggregation-without-context: a named model prefix is stripped before asking whether the path is absolute - `message>/` is not relative');
      assert(!agg.some((x) => String(x.value) === 'T_CHILDREN'),
        'relative-aggregation-without-context: an aggregation whose value the reconstructor could not resolve still makes its children a row template - the blind spot is not a defect');

      const bound = checkAbapSource(fs.readFileSync(f('elementbind.clas.abap'), 'utf8'))
        .findings.filter((x) => x.type === 'relative-aggregation-without-context');
      assert(bound.length === 0,
        `relative-aggregation-without-context: cs_event-bind_element sets a context on a whole slot at runtime, so nothing in the class is contextless (got ${bound.map((x) => x.value).join() || 'none'})`);
      assert(checkAbapSource(fs.readFileSync(f('elementbind.clas.abap'), 'utf8').replace('cs_event-bind_element', 'cs_event-popup_close'))
        .findings.some((x) => x.type === 'relative-aggregation-without-context'),
        'relative-aggregation-without-context: the same fixture without the element bind IS reported - the suppression is the bind, not the shape');

      /* The wire binds ONE slot. Asked of the whole CLASS, a single popup wire
       * disarmed the check for every document including the main slot that was
       * never element-bound - one popup wire silencing a whole port. */
      const slot = checkAbapSource(fs.readFileSync(f('slotbind.clas.abap'), 'utf8')).findings;
      assert(slot.filter((x) => x.type.startsWith('relative-')).length === 2
        && slot.some((x) => x.type === 'relative-binding-without-context' && x.value === 'HEADLINE')
        && slot.some((x) => x.type === 'relative-aggregation-without-context' && x.value === 'T_PRODUCT'),
        `bind_element scopes to the slot it names: the MAIN document is still judged (got ${slot.map((x) => `${x.type}=${x.value}`).join(' ') || 'none'})`);
      assert(!slot.some((x) => ['NAME', 'T_ITEM'].includes(String(x.value))),
        'bind_element: the POPUP document it does name is suppressed, relative paths and all');
      assert(elementBoundSlots('client->follow_up_action( val = client->cs_event-bind_element view = client->cs_view-nested ).').slots.has('NEST'),
        'bind_element: the cs_view constant NAME is not its value - cs_view-nested is NEST');
      assert(elementBoundSlots('client->follow_up_action( val = client->cs_event-bind_element t_arg = VALUE #( ( `0` ) ) ).').slots.has('MAIN'),
        'bind_element: with no view parameter the ABAP DEFAULT applies, and it is cs_view-main');
      assert(elementBoundSlots('client->follow_up_action( val = client->cs_event-bind_element view = lv_slot ).').all,
        'bind_element: a slot that is not a literal could be any of them, so it suppresses everywhere - a wrong second guess is worse than silence');
      assert(!elementBoundSlots('" client->follow_up_action( val = client->cs_event-bind_element )').slots.size,
        'bind_element: a wire in a COMMENT is not a wire');
    }

    // --- an attribute the reconstructor could not resolve is still versioned --
    // A COND #( ) value is dropped from the document rather than invented, so
    // the member used to be invisible to every version rule. app 454 hid a
    // UI5 >= 1.117 floor behind exactly this and view-gates reported pass.
    {
      const cond = checkAbapSource(fs.readFileSync(f('condattr.clas.abap'), 'utf8'))
        .findings.filter((x) => x.type === 'member-too-new' && x.member === 'initialFocus');
      assert(cond.length === 1 && cond[0].since === '1.117.0',
        `member-too-new: a COND-valued attribute is still judged for its version (got ${cond.map((x) => x.since).join() || 'none'})`);
    }

    // --- a member with no own @since inherits its DECLARING class's version ---
    // sap.f.cards.BaseHeader is @1.86 and its `press` carries no member-level
    // @since, so the walk used to stop at "base version". A member cannot
    // predate the class that declares it - and cannot postdate a subclass
    // that already carried it, which is the case below.
    {
      const inh = checkAbapSource(fs.readFileSync(f('inheritedsince.clas.abap'), 'utf8'))
        .findings.filter((x) => x.type === 'member-too-new' && x.member === 'press');
      /* …unless the declaring class is YOUNGER than the control: UI5 extracted
       * BaseHeader (@1.86) out of the @1.64 Header, and `press` moved up with
       * it - the tagged 1.64.0 source declares it on Header. A member that
       * shipped with the control is dated at the control's release, so this
       * press is not reported at a 1.71 floor; test/review/props.mjs holds
       * the "older base" doctrine with sap.m.plugins.ColumnResizer.enabled. */
      assert(inh.length === 0,
        `member-too-new: press on the @1.64 Header shipped with it - BaseHeader (@1.86) took it over later, so the younger base does not date it (got ${inh.map((x) => x.since).join() || 'none'})`);
    }

    // --- a value the reconstruction had to guess at is not judged ------------
    // ids and binding paths built inside a LOOP from the loop variable: the
    // reconstruction cannot compute them, so every row collapses to the same
    // string. Reporting that reports the reconstruction, not the app.
    const looped = checkAbapSource(`
  CLASS zcl_l DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA t_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.
  ENDCLASS.
  CLASS zcl_l IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      DATA(box) = view->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\` )->ele( \`VBox\` ).
      DO 3 TIMES.
        DATA(i) = sy-index.
        box->tag( \`Input\`
            )->a( n = \`id\`    v = |FIELD_{ i }|
            )->a( n = \`value\` v = |\\{/T_ROWS/{ i }/NAME\\}|
            )->tag( \`CheckBox\`
            )->a( n = \`id\`       v = |FLAG_{ i }|
            )->a( n = \`selected\` v = |\\{/T_ROWS/{ i }/FLAG\\}| ).
      ENDDO.
      client->view_display( view->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`);
    assert(!looped.findings.some((x) => x.type === 'duplicate-id'),
      `guessed value: a loop-built id is not a duplicate (got ${looped.findings.filter((x) => x.type === 'duplicate-id').length})`);
    assert(!looped.findings.some((x) => x.type === 'unknown-binding-path'),
      `guessed value: a loop-built binding path is not judged (got ${looped.findings.filter((x) => x.type === 'unknown-binding-path').map((x) => x.value).join()})`);
    // and the DOCUMENT stays renderable: UI5 refuses a duplicate id outright, so
    // two loop-built ids collapsing to one string would kill the render of a view
    // that is fine at runtime
    const loopIds = [...looped.docs[0].matchAll(/ id="([^"]*)"/g)].map((x) => x[1]);
    assert(loopIds.length > 1 && new Set(loopIds).size === loopIds.length,
      `guessed value: each loop-built id reconstructs uniquely (got ${loopIds.join()})`);

    // --- an INLINE structure is a structure ----------------------------------
    // `DATA: BEGIN OF message, … END OF message.` names no type of its own, and
    // an unresolved one turns every path through it into unknown-binding-path
    // plus a '' in the render model, which then fails strict property validation
    // on the first enum or boolean field
    const inlineStruct = checkAbapSource(fs.readFileSync(f('inlinestruct.clas.abap'), 'utf8'));
    assert(inlineStruct.findings.length === 0,
      `inline structure: every path through one resolves (got ${inlineStruct.findings.map((x) => `${x.type}:${x.value || ''}`).join() || 'none'})`);
    assert(Object.hasOwn(inlineStruct.model, 'MESSAGE') && Object.hasOwn(inlineStruct.model, 'ERROR'),
      'inline structure: both spellings (one-line DATA: BEGIN OF, and READ-ONLY on the next line) reach the model');
    // the same declaration read by the VISIBILITY scan: a comma split saw
    // `BEGIN OF message` and registered the fields in the attribute's place, so
    // every binding through a PUBLIC inline structure reported as non-public
    assert(!checkAbapRules(fs.readFileSync(f('inlinestruct.clas.abap'), 'utf8'))
      .some((x) => x.type === 'binding-to-nonpublic'),
      'inline structure: one declared in the PUBLIC SECTION is public');

    // --- CONTROL_BY_ID against the ids the class actually declares ------------
    const actionFindings = checkAbapRules(fs.readFileSync(f('actionid.clas.abap'), 'utf8'));
    const ids = actionFindings.filter((x) => x.type === 'frontend-action-unknown-id');
    assert(ids.length === 2 && ids.map((x) => x.value).sort().join() === 'messageview,msgView',
      `frontend-action-unknown-id: the miscased CONTROL_BY_ID and the unknown SET_FOCUS id are reported (got ${ids.map((x) => x.value).join() || 'none'})`);
    assert(ids.find((x) => x.value === 'msgView')?.control === 'SET_FOCUS',
      'frontend-action-unknown-id: the id-addressed action names itself in the finding');
    assert(ids[0].allowed.sort().join() === 'mainPage,messageView',
      `frontend-action-unknown-id: the finding carries the declared ids (got ${ids[0].allowed.join()})`);
    const anchors = actionFindings.filter((x) => x.type === 'popover-anchor-unknown-id');
    assert(anchors.length === 1 && anchors[0].value === 'mainpage',
      `popover-anchor-unknown-id: only the miscased anchor is reported (got ${anchors.map((x) => x.value).join() || 'none'})`);
    assert(checkAbapRules(`
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->tag( \`Page\` )->a( n = \`id\` v = |page{ idx }| ).
      client->follow_up_action( val = client->cs_event-control_by_id
                                t_arg = VALUE #( ( \`page1\` ) ( \`focus\` ) ) ).`)
      .filter((x) => x.type === 'frontend-action-unknown-id').length === 0,
      'frontend-action-unknown-id: a class that builds ids at runtime is not judged');
    assert(checkAbapRules(fs.readFileSync(f('wire.clas.abap'), 'utf8'))
      .filter((x) => x.type === 'frontend-action-unknown-id').length === 0,
      'frontend-action-unknown-id: a class whose views declare no id at all is not judged');

    assert(checkAbapRules('DATA(vn) = client->get( )-viewname.')
      .some((x) => x.type === 'get-viewname-removed'),
      'get-viewname-removed: a read of the removed ty_s_get component is reported');
    assert(!checkAbapRules('DATA(ev) = client->get( )-event.')
      .some((x) => x.type === 'get-viewname-removed'),
      'get-viewname-removed: the surviving components are left alone');

    // --- the frontend's remaining closed sets --------------------------------
    const act = (call) => checkAbapRules(`
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->tag( \`Table\` )->a( n = \`id\` v = \`tbl\` ).
      ${call}
      client->view_display( v->stringify( ) ).`);

    assert(act('client->follow_up_action( val = `SET_TITEL` t_arg = VALUE #( ( `Hi` ) ) ).')
      .some((x) => x.type === 'unknown-frontend-action' && x.value === 'SET_TITEL'),
      'unknown-frontend-action: a literal name outside the dispatch table is reported');
    assert(act('client->follow_up_action( val = `set_title` t_arg = VALUE #( ( `Hi` ) ) ).')
      .some((x) => x.type === 'unknown-frontend-action'),
      'unknown-frontend-action: the dispatch table is case-sensitive, so a lower-cased name is reported');
    assert(!act('client->follow_up_action( val = `SET_TITLE` t_arg = VALUE #( ( `Hi` ) ) ).')
      .some((x) => x.type === 'unknown-frontend-action'),
      'unknown-frontend-action: a known literal name is fine');
    assert(!act('client->follow_up_action( val = `POPUP_CLOSE` ).')
      .some((x) => x.type === 'unknown-frontend-action'),
      'unknown-frontend-action: a server-remapped alias is fine');
    assert(act('client->follow_up_action( val = `NAV_CONTAINER_TO` t_arg = VALUE #( ( `nav` ) ( `p2` ) ) ).')
      .some((x) => x.type === 'unknown-frontend-action' && x.value === 'NAV_CONTAINER_TO'),
      'unknown-frontend-action: NAV_CONTAINER_TO is gone upstream (abap2UI5#2776), so the retired alias is reported');
    assert(!act('client->follow_up_action( val = `sap.m.URLHelper.redirect(\'https://x\')` ).')
      .some((x) => x.type === 'unknown-frontend-action'),
      'unknown-frontend-action: the raw-JavaScript escape hatch is not an unknown ACTION');
    assert(act('client->follow_up_action( val = `sap.m.URLHelper.redirect(\'https://x\')` ).')
      .some((x) => x.type === 'raw-javascript-to-frontend' && x.member === 'follow_up_action'),
      'raw-javascript-to-frontend: the escape hatch ships code, and code does not belong on the wire');
    assert(act('client->_event_client( val = `sap.m.URLHelper.redirect(\'https://x\')` ).')
      .some((x) => x.type === 'unknown-frontend-action'),
      'unknown-frontend-action: _event_client has no raw-JS path — a non-name literal can never dispatch');
    // and neither has follow_up_action where its RESULT is consumed: that is
    // the `IF result IS SUPPLIED` branch, which goes to get_event_client( ) —
    // _event_client's own body — and never near custom_js
    {
      const wired = act(')->a( n = `press` v = client->follow_up_action( val = `sap.m.URLHelper.redirect(\'https://x\')` ) )');
      assert(!wired.some((x) => x.type === 'raw-javascript-to-frontend')
        && wired.some((x) => x.type === 'unknown-frontend-action'),
      'raw-javascript-to-frontend: the escape hatch is the STATEMENT form — a wired follow_up_action is an unknown action, like _event_client');
    }
    assert(!act('client->follow_up_action( val = lv_dynamic ).')
      .some((x) => x.type === 'raw-javascript-to-frontend' || x.type === 'unknown-frontend-action'),
      'raw-javascript-to-frontend: a runtime value is not statically knowable and not judged');

    assert(act('client->_event_client( val = client->cs_event-control_by_id view = `NESTED` t_arg = VALUE #( ( `tbl` ) ( `focus` ) ) ).')
      .some((x) => x.type === 'unknown-view-slot' && x.value === 'NESTED'),
      'unknown-view-slot: NESTED is not a slot (cs_view-nested is NEST)');
    assert(!act('client->_event_client( val = client->cs_event-control_by_id view = `NEST` t_arg = VALUE #( ( `tbl` ) ( `focus` ) ) ).')
      .some((x) => x.type === 'unknown-view-slot'),
      'unknown-view-slot: the real slot keys are fine');
    assert(act('client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( `200` ) ( `SIDEBAR` ) ) ).')
      .some((x) => x.type === 'unknown-view-slot' && x.value === 'SIDEBAR'),
      'unknown-view-slot: SET_SIZE_LIMIT\'s view key is judged too');

    /* literal-view-slot: the same wire one keystroke EARLIER. A correct
     * literal is not an error and is not nothing either - it is the spelling
     * the compiler cannot check, and `NESTED` above is what happens next. */
    {
      const litSrc = `
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->tag( \`Table\` )->a( n = \`id\` v = \`tbl\` ).
      client->follow_up_action( val = client->cs_event-control_by_id view = \`NEST\` t_arg = VALUE #( ( \`tbl\` ) ( \`focus\` ) ) ).
      client->view_display( v->stringify( ) ).`;
      const lit = checkAbapRules(litSrc);
      const slot = lit.find((x) => x.type === 'literal-view-slot');
      assert(slot && slot.value === 'NEST',
        `literal-view-slot: a correct slot written as a literal is reported (got ${lit.map((x) => x.type).join(', ') || 'nothing'})`);
      assert(severityOf(slot) === 'hint',
        `literal-view-slot: a hint - the wire works, it is only unchecked (got ${severityOf(slot)})`);
      assert(!lit.some((x) => x.type === 'unknown-view-slot'),
        'literal-view-slot: a valid slot is never ALSO reported as unknown');
      // …and the wrong literal stays the error it was, without a second
      // finding telling its author to write a constant they got wrong anyway
      assert(!act('client->_event_client( val = client->cs_event-control_by_id view = `NESTED` t_arg = VALUE #( ( `tbl` ) ( `focus` ) ) ).')
        .some((x) => x.type === 'literal-view-slot'),
        'literal-view-slot: an unknown slot is one finding, not two');

      // the fix is the point of the rule: an exact substitution, and what it
      // produces has to be the CONSTANT for that value - NEST is cs_view-nested
      const { applyFixes } = await import('../../lib/fix.mjs');
      const fixed = applyFixes(litSrc, lit).output;
      assert(/view = client->cs_view-nested\b/.test(fixed) && !/view = `NEST`/.test(fixed),
        `literal-view-slot: --fix writes the constant carrying that value (got ${fixed.split('\n').find((l) => l.includes('control_by_id'))})`);
      assert(!checkAbapRules(fixed).some((x) => x.type === 'literal-view-slot' || x.type === 'unknown-view-slot'),
        'literal-view-slot: the fixed source is clean - the fix does not trade one finding for another');

      // both t_arg carriers too: SET_SIZE_LIMIT's view key and the shortcut
      // scope sit inside a VALUE #( ) row, where the constant is just as valid
      const sizeLit = act('client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( `200` ) ( `MAIN` ) ) ).');
      assert(sizeLit.some((x) => x.type === 'literal-view-slot' && x.value === 'MAIN'),
        'literal-view-slot: SET_SIZE_LIMIT\'s view key is offered the constant as well');
      assert(act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ( `POPUP` ) ) ). client->check_on_event( `SAVE` ).')
        .some((x) => x.type === 'literal-view-slot' && x.value === 'POPUP'),
        'literal-view-slot: a shortcut scope that IS a slot is offered it too');
      // a scope that is a control id stays a control id — only an exact slot
      // value is judged, so `tbl` is not read as a mis-cased slot
      assert(!act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ( `tbl` ) ) ). client->check_on_event( `SAVE` ).')
        .some((x) => x.type === 'literal-view-slot'),
        'literal-view-slot: a control id used as a scope is not a slot');
      // the constant form is what the rule ASKS for, so it must never fire on it
      assert(!act('client->follow_up_action( val = client->cs_event-control_by_id view = client->cs_view-nested t_arg = VALUE #( ( `tbl` ) ( `focus` ) ) ).')
        .some((x) => x.type === 'literal-view-slot' || x.type === 'unknown-view-slot'),
        'literal-view-slot: the constant itself is the answer, never the finding');
    }

    assert(act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+Shift` ) ( `SAVE` ) ) ).')
      .some((x) => x.type === 'invalid-keyboard-shortcut'),
      'invalid-keyboard-shortcut: a modifiers-only combo binds nothing');
    const shortcutOk = act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Cmd+Return` ) ( `SAVE` ) ) ). client->check_on_event( `SAVE` ).');
    assert(!shortcutOk.some((x) => x.type === 'invalid-keyboard-shortcut'),
      'invalid-keyboard-shortcut: aliases resolve, Cmd+Return names a key');
    assert(act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ) ).')
      .some((x) => x.type === 'event-without-handler' && x.value === 'SAVE'),
      'event-without-handler: a shortcut\'s backend event with no branch is a dead wire');
    assert(!shortcutOk.some((x) => x.type === 'event-without-handler'),
      'event-without-handler: a handled shortcut event is fine');
    assert(act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ( `sidePanel` ) ) ). client->check_on_event( `SAVE` ).')
      .some((x) => x.type === 'frontend-action-unknown-id' && x.member === 'scope'),
      'frontend-action-unknown-id: a shortcut scope that is neither a slot nor a declared id');
    assert(!act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ( `POPUP` ) ) ). client->check_on_event( `SAVE` ).')
      .some((x) => x.type === 'frontend-action-unknown-id'),
      'frontend-action-unknown-id: a slot-key scope is fine');

    assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `NAME` ) ( `contains` ) ( `x` ) ) ).')
      .some((x) => x.type === 'invalid-frontend-action' && x.member === 'filter operator' && x.value === 'contains'),
      'invalid-frontend-action: the filter operator whitelist is case-sensitive');
    assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `NAME` ) ( `Contains` ) ( `x` ) ) ).')
      .some((x) => x.type === 'invalid-frontend-action'),
      'invalid-frontend-action: a whitelisted operator is fine');
    assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `NAME` ) ( `contains` ) ) ).')
      .some((x) => x.type === 'invalid-frontend-action' && x.member === 'filter operator'),
      'invalid-frontend-action: with no value slot the runtime clears before reading the operator — inert, not judged');
    assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[[["NAME","contains","x"]]]` ) ) ).')
      .some((x) => x.type === 'invalid-frontend-action' && x.member === 'filter operator'),
      'invalid-frontend-action: compound filter-group rows are judged too');
    assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[["NAME","Contains","x"]]` ) ) ).')
      .some((x) => x.type === 'invalid-action-payload' && x.member === 'filter row'),
      'invalid-action-payload: a group of strings is a missing nesting level — upstream logs "bad filter row"');
    assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[[["NAME","Contains","x"],["NAME","EQ","y"]]]` ) ) ).')
      .some((x) => x.type === 'invalid-action-payload' || x.type === 'invalid-frontend-action'),
      'compound filter groups: the correct nested form is fine');
    {
      const { checkAbapRules } = await import('../observe.mjs');
      const withEnum = (src) => checkAbapRules(src, { enumFields: new Map([['T_APPOINTMENTS', new Set(['TYPE'])]]) });
      const hit = (src) => withEnum(src).some((x) => x.type === 'enum-field-unset-on-insert' && x.member === 'TYPE');
      assert(hit('INSERT VALUE #( title = `New` start_at = s ) INTO TABLE t_appointments.'),
        'enum-field-unset-on-insert: a row built without the enum-fed field ships "" and throws');
      assert(!withEnum('INSERT VALUE #( title = `New` type = `None` start_at = s ) INTO TABLE t_appointments.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: seeding the default is the repair');
      assert(!withEnum('DATA(p) = VALUE #( ( `TYPE` ) ).\nclient->_bind( val = t omit_initial_paths = VALUE #( ( `TYPE` ) ) ).\nINSERT VALUE #( title = `New` ) INTO TABLE t_appointments.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: omit_initial_paths is the other repair and is honoured');
      assert(!checkAbapRules('INSERT VALUE #( title = `New` ) INTO TABLE t_appointments.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: with no enum-bound field in the view there is nothing to report');

      /* The three construction sites, each of which the corpus sweep of
       * 2026-08-26 found the rule blind to. `INSERT VALUE #( )` was the only one
       * judged; the model_init seed hid three defects and the work area two. */
      assert(hit('t_appointments = VALUE #( ( title = `A` type = `Type01` )\n( title = `B` ) ).'),
        'enum-field-unset-on-insert: the model_init table seed is a row-build site too - it was the dominant one');
      assert(hit('<person>-t_appointments = VALUE #( ( title = `B` ) ).'),
        'enum-field-unset-on-insert: the seed of a NESTED table, written through a field symbol');
      assert(hit('DATA(appt) = VALUE ty_s_appointment( title = `B` ).\nINSERT appt INTO TABLE t_appointments.'),
        'enum-field-unset-on-insert: a row assembled in a work area is the same row');
      assert(hit('APPEND VALUE #( title = `B` ) TO <person>-t_appointments.'),
        'enum-field-unset-on-insert: APPEND into a nested table resolves to the aggregation path, not to a key that does not exist');
      assert(!withEnum('DATA(appt) = VALUE ty_s_appointment( title = `B` ).\nappt-type = `Type01`.\nINSERT appt INTO TABLE t_appointments.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a work-area field filled after the constructor is set');

      /* …and the four shapes that are NOT it. Every one of them is a real port
       * in samples-controls that the widened rule reported before these guards. */
      assert(!withEnum('t_appointments = VALUE #( type = `Type01` ( title = `A` ) ( title = `B` ) ).')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a component set ONCE before the rows is ABAP\'s per-table default and every row carries it (app 407)');
      assert(!withEnum('t_appointments = VALUE #( FOR row IN t_all WHERE ( name = x ) ( row ) ).')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a comprehension copies a whole row - there is no field list to read (app 505)');
      assert(!withEnum('t_appointments = VALUE #( ( title = `A` ) ).\nLOOP AT t_appointments REFERENCE INTO DATA(r).\nr->type = `Type01`.\nENDLOOP.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a seed a LOOP completes afterwards is not a row built without the field (apps 009/208/505)');
      assert(!withEnum('t_appointments = VALUE #( ( title = `A` ) ).\nt_appointments[ 1 ]-type = `Type01`.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a component written through a table expression counts as set (app 549)');
      assert(!withEnum('t_others = VALUE #( ( title = `A` ) ).')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a seed of a table the view does not bind that way is not judged against it');
    }

    /* The VIEW half, end to end: which table each enum-fed field belongs to.
     *
     * The fixture is the shape of the seven ports the 2026-08-26 corpus sweep
     * had to fix by hand. A PlanningCalendar binds THREE tables - `rows`,
     * `specialDates`, and the `appointments` NESTED one row deeper - and only
     * the innermost template carries `ariaHasPopup`. Before this the rule saw
     * one absolute path and pooled every enum field below it, so the seed of
     * `t_special` was reported for an ARIA it has no business carrying, and the
     * nested `T_APPOINTMENTS` resolved to no key at all.
     */
    {
      const src = fs.readFileSync(f('enumseed.clas.abap'), 'utf8');
      const seeds = (text) => checkAbapSource(text).findings
        .filter((x) => x.type === 'enum-field-unset-on-insert');
      assert(seeds(src).length === 0,
        `enum-field-unset-on-insert: the fixture as written is CORRECT - every row carries its enum seed (got ${seeds(src).map((x) => `${x.member}@${x.line}`).join() || 'none'})`);
      /* Each repair removed on its own. A rule that fires once for a class
       * proves nothing about the site the fix was written at - and every one of
       * these is a shape the rule was blind to before 2026-08. */
      const site = (find, repl, member, why) => {
        const broken = src.replace(find, repl);
        assert(broken !== src, `enum-field-unset-on-insert fixture: the seed "${why}" is there to remove`);
        const got = seeds(broken);
        assert(got.some((x) => x.member === member), `enum-field-unset-on-insert: ${why} (got ${got.map((x) => x.member).join() || 'none'})`);
      };
      site('type = `Type06` aria = `None`', 'type = `Type06`', 'ARIA',
        'the model_init seed of a NESTED table is judged row by row (apps 531/536/538)');
      site('type     = `Type09`\n                    aria     = `None`', 'type     = `Type09`', 'ARIA',
        'an INSERT into <fs>-t_appointments resolves through the RELATIVE aggregation path (apps 108/547)');
      site('type     = `Type09`\n                                                aria     = `None`', 'type     = `Type09`', 'ARIA',
        'a row assembled in a work area is judged where it is built (apps 537/538)');
      site('type = `NonWorking`', 'title = `NonWorking`', 'TYPE',
        'the sibling `specialDates` template keeps its OWN field - T_SPECIAL is judged for TYPE, never for the ARIA two levels below it');
      site('lr_product->weightstate =', 'lr_product->weight =', 'WEIGHTSTATE',
        'a second table in the same view is judged against its own template once nothing fills it later');
    }

    assert(act('client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `t` ) ( `expand` ) ( `$event.oSource.getSelectedItems().map(function (o) { return o.getId(); })` ) ) ).')
      .some((x) => x.type === 'event-arg-js-callback'),
      'event-arg-js-callback: a function literal in a resolved argument loses the whole handler');
    assert(act('client->_event( val = `X` t_arg = VALUE #( ( `${x}.filter(a => a.id)` ) ) ).')
      .some((x) => x.type === 'event-arg-js-callback'),
      'event-arg-js-callback: an arrow function fails the same way');
    assert(!act('client->follow_up_action( val = client->cs_event-control_global t_arg = VALUE #( ( `MESSAGE_TOAST` ) ( `show` ) ( `the function was called` ) ) ).')
      .some((x) => x.type === 'event-arg-js-callback'),
      'event-arg-js-callback: the word in a quoted string argument is shipped as text, not parsed');
    assert(!act('client->_event( val = `X` t_arg = VALUE #( ( `${$parameters>/value}` ) ) ).')
      .some((x) => x.type === 'event-arg-js-callback'),
      'event-arg-js-callback: a plain resolved expression is fine');
    assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[{"path":"NAME","operator":"Contains","value1":"x"}]` ) ) ).')
      .some((x) => x.type === 'filter-groups-not-arrays'),
      'filter-groups-not-arrays: the object form is dropped whole and clears the binding instead of filtering it');
    assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[]` ) ) ).')
      .some((x) => x.type === 'filter-groups-not-arrays'),
      'filter-groups-not-arrays: an empty payload IS the clear form and is not reported');
    assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[[["NAME","Contains","x"]]]` ) ) ).')
      .some((x) => x.type === 'filter-groups-not-arrays'),
      'filter-groups-not-arrays: the correct nested form is not reported');
    assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[oops` ) ) ).')
      .some((x) => x.type === 'invalid-action-payload' && x.control === 'BINDING_CALL'),
      'invalid-action-payload: malformed filter-groups JSON is rejected with a log upstream');

    assert(act('client->follow_up_action( val = client->cs_event-smart_variant_init t_arg = VALUE #( ( `vm` ) ( `vmTable` ) ) ).')
      .filter((x) => x.type === 'frontend-action-unknown-id').length === 2,
      'frontend-action-unknown-id: every id slot of a multi-slot action is judged (SMART_VARIANT_INIT)');
    assert(act('client->follow_up_action( val = `WIZARD_SET_NEXT_STEP` t_arg = VALUE #( ( `wiz` ) ( `step1` ) ( `step2` ) ) ).')
      .some((x) => x.type === 'unknown-frontend-action'),
      'the removed WIZARD_SET_NEXT_STEP is an unknown action now, not a set of id slots');
    assert(!act('client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `tbl/items/0` ) ( `focus` ) ) ).')
      .some((x) => x.type === 'frontend-action-unknown-id'),
      'frontend-action-unknown-id: the aggregation-item form judges only its id segment');
    assert(act('client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `tbl` ) ( `openBy` ) ( `anchor1` ) ) ).')
      .some((x) => x.type === 'frontend-action-unknown-id' && x.member === 'openBy'),
      'frontend-action-unknown-id: an anchor argument naming an undeclared id');
    assert(!act('client->_event_client( val = client->cs_event-control_by_id t_arg = VALUE #( ( `tbl` ) ( `openBy` ) ( `$event.oSource.sId` ) ) ).')
      .some((x) => x.type === 'frontend-action-unknown-id'),
      'frontend-action-unknown-id: a $-prefixed anchor is resolved client-side, not a static id (corpus shape)');
    assert(!act('client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `tbl` ) ( `setActivePage` ) ( |tbl/pages/{ idx }| ) ) ).')
      .some((x) => x.type === 'frontend-action-unknown-id'),
      'frontend-action-unknown-id: a template with an interpolation is composed at runtime, never a literal (corpus shape)');

    // --- object payloads (enum values need the snapshot) ----------------------
    const payloadClass = (payload) => checkAbapSource(`CLASS zcl_p DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
  ENDCLASS.
  CLASS zcl_p IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->tag( \`Table\` )->a( n = \`id\` v = \`tbl\` )->end( ).
      client->follow_up_action( val = client->cs_event-control_by_id
                                t_arg = VALUE #( ( \`tbl\` ) ( \`setSticky\` ) ( \`${payload}\` ) ) ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`).findings;
    assert(payloadClass('ColumnHeaders').some((x) => x.type === 'invalid-action-payload'),
      'invalid-action-payload: a bare enum key is not JSON — castArg turns it into {}');
    assert(!payloadClass('["ColumnHeaders"]').some((x) => x.type === 'invalid-action-payload'),
      'invalid-action-payload: a JSON array of known enum keys is the correct form');
    assert(payloadClass('["ColumnHeader"]').some((x) => x.type === 'invalid-action-payload' && x.value === 'ColumnHeader'),
      'invalid-action-payload: an unknown sap.m.Sticky key is dropped by UI5 silently');

    // --- json = abap_true on a scalar-typed property --------------------------
    const jsonBind = (leaf) => checkAbapSource(`CLASS zcl_j DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA manifest TYPE string.
  ENDCLASS.
  CLASS zcl_j IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->a( n = \`xmlns:w\` v = \`sap.ui.integration.widgets\`
          )->a( n = \`xmlns:core\` v = \`sap.ui.core\`
          ${leaf}
          )->end( ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`).findings;
    assert(jsonBind(')->tag( `Text` )->a( n = `text` v = client->_bind( val = manifest json = abap_true )')
      .some((x) => x.type === 'json-bind-on-scalar-property' && x.member === 'text'),
      'json-bind-on-scalar-property: a json splice on a string property');
    assert(!jsonBind(')->tag( n = `Card` ns = `w` )->a( n = `manifest` v = client->_bind( val = manifest json = abap_true )')
      .some((x) => x.type === 'json-bind-on-scalar-property'),
      'json-bind-on-scalar-property: an object/any-typed property is what json is FOR');
    assert(!jsonBind(')->tag( `Text` )->a( n = `text` v = client->_bind( manifest )')
      .some((x) => x.type === 'json-bind-on-scalar-property'),
      'json-bind-on-scalar-property: a plain bind of the same attribute is fine');

    // --- JavaScript through the VIEW ------------------------------------------
    assert(jsonBind(')->tag( `Button` )->a( n = `press` v = `z2ui5.oView.doSomething()` )')
      .some((x) => x.type === 'raw-javascript-to-frontend' && x.member === 'press'),
      'raw-javascript-to-frontend: a hand-written handler string on an event attribute');
    assert(!jsonBind(')->tag( `Button` )->a( n = `press` v = client->_event( `SAVE` ) )')
      .some((x) => x.type === 'raw-javascript-to-frontend'),
      'raw-javascript-to-frontend: the client->_event( ) wire is the correct form');
    assert(jsonBind(')->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<script>alert(1)</script>` )')
      .some((x) => x.type === 'raw-javascript-to-frontend' && x.value === 'script tag'),
      'raw-javascript-to-frontend: a <script> tag through core:HTML content');
    assert(!jsonBind(')->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<style>.a \\{color:red\\}</style>` )')
      .some((x) => x.type === 'raw-javascript-to-frontend'),
      'raw-javascript-to-frontend: a stylesheet is not code and stays fine');
    const { checkXmlSource } = await import('../observe.mjs');
    assert(!checkXmlSource('<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Button press=".onPress"/></mvc:View>')
      .findings.some((x) => x.type === 'raw-javascript-to-frontend'),
      'raw-javascript-to-frontend: a raw view.xml has a controller — handler names belong there');

    // --- date/time model types over a JSON model ------------------------------
    const dates = checkAbapSource(fs.readFileSync(f('datetype.clas.abap'), 'utf8'));
    const noSource = dates.findings.filter((x) => x.type === 'date-type-without-source');
    assert(noSource.length === 4,
      `date-type-without-source: four sourceless date bindings (got ${noSource.length})`);
    assert(noSource.map((x) => x.value).sort().join() === 'DateType,TimeType,sap.ui.model.type.Date,sap.ui.model.type.DateTime',
      `date-type-without-source: the alias, the full module name and the quoted-key spelling are all judged (got ${noSource.map((x) => x.value).sort().join()})`);
    // the two halves have to move together: a quoted 'type' with a quoted
    // 'source' is CORRECT, and teaching the rule only the first spelling would
    // turn every one of apps 017/018's date bindings into a finding
    assert(noSource.filter((x) => x.value === 'sap.ui.model.type.Date').length === 1,
      `date-type-without-source: a QUOTED source counts, so only the sourceless quoted binding is reported (got ${noSource.filter((x) => x.value === 'sap.ui.model.type.Date').length})`);
    assert(!dates.findings.some((x) => x.type === 'date-type-without-source' && x.value === 'sap.ui.model.type.Float'),
      'date-type-without-source: a non-date type never needs a source format');

    // --- a picker whose value has neither a binding type nor a valueFormat ----
    const picker = checkAbapSource(fs.readFileSync(f('pickerformat.clas.abap'), 'utf8'));
    const locale = picker.findings.filter((x) => x.type === 'picker-value-without-format');
    assert(locale.length === 3,
      `picker-value-without-format: three unformatted picker values (got ${locale.length}: ${locale.map((x) => x.value).join()})`);
    assert(locale.every((x) => x.severity === 'warning' && x.member === 'value'),
      'picker-value-without-format: a warning on the value property');
    assert(locale.map((x) => x.value).sort().join() === 'END_AT,REC_END,START_AT',
      `picker-value-without-format: the three fields the class itself authors (got ${locale.map((x) => x.value).sort().join()})`);
    assert(locale.some((x) => x.control === 'sap.m.DateTimePicker')
      && locale.some((x) => x.control === 'sap.m.DatePicker')
      && locale.some((x) => x.control === 'sap.m.DateRangeSelection'),
      'picker-value-without-format: the family comes from the metadata (value + valueFormat), not from a name list');
    assert(!locale.some((x) => x.value === 'TYPED_AT'),
      'picker-value-without-format: a TYPED binding owns the pattern — valueFormat is moot, not missing');
    assert(!locale.some((x) => x.value === 'FORMATTED'),
      'picker-value-without-format: a declared valueFormat is the fix, never the defect');
    assert(!locale.some((x) => x.value === 'MADE_ON'),
      'picker-value-without-format: a field the class writes as digit-free text (`n/a`) is not a date in any locale');
    assert(!locale.some((x) => x.value === 'EXPIRES'),
      'picker-value-without-format: a field the class never writes has only ONE author — the picker reads back what it wrote');
    assert(!locale.some((x) => x.control === 'sap.m.TimePicker'),
      'picker-value-without-format: no value binding, so nothing can be written back');
    assert(!locale.some((x) => x.value === 'NOTE'),
      'picker-value-without-format: sap.m.Input has no valueFormat — it is not a picker and formats nothing');
    // the same view as a raw XML document: there is no ABAP class to ask who
    // else writes the field, so the rule has nothing to judge and says nothing
    assert(!checkXmlSource('<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><DateTimePicker value="{/START_AT}"/></mvc:View>')
      .findings.some((x) => x.type === 'picker-value-without-format'),
      'picker-value-without-format: a raw view.xml has no class to read the second author from');

    // --- frontend-action wires and CSS braces ---------------------------------
    const wire = checkAbapSource(fs.readFileSync(f('wire.clas.abap'), 'utf8'));
    const actions = wire.findings.filter((x) => x.type === 'invalid-frontend-action');
    assert(actions.length === 4, `invalid-frontend-action: four bad wires (got ${actions.length})`);
    assert(actions.some((x) => x.control === 'CONTROL_GLOBAL' && x.value === 'MESSAGE_TOASTER' && x.member === 'global object'),
      'invalid-frontend-action: an unknown global object');
    assert(actions.some((x) => x.control === 'CONTROL_GLOBAL' && x.value === 'display' && x.allowed.join() === 'show'),
      'invalid-frontend-action: a method the global does not offer, with its allowed set');
    assert(actions.some((x) => x.control === 'BINDING_CALL' && x.value === 'refresh'),
      'invalid-frontend-action: a binding method that is not filter or sort');
    assert(actions.some((x) => x.member === 'view slot'),
      'invalid-frontend-action: the obsolete empty view slot of CONTROL_BY_ID');
    assert(!actions.some((x) => ['MESSAGE_TOAST', 'show', 'hide', 'BUSY_INDICATOR'].includes(x.value)),
      'invalid-frontend-action: a correct wire is never reported');

    const { ACTION_ARGS, GLOBAL_TARGETS, FRONTEND_EVENTS, FRONTEND_EVENT_ALIASES } = await import('../../lib/frontend-actions.mjs');
    assert(Object.keys(ACTION_ARGS).every((a) => a === a.toLowerCase()) && GLOBAL_TARGETS.MESSAGE_TOAST.includes('show'),
      'invalid-frontend-action: the catalog is keyed by the cs_event constant name');
    assert(checkAbapRules('client->follow_up_action( val = client->cs_event-control_global '
      + 't_arg = VALUE #( ( `POPUP` ) ( `setWithinArea` ) ( `withinArea` ) ) ).')
      .filter((x) => x.type === 'invalid-frontend-action').length === 0,
      'invalid-frontend-action: POPUP.setWithinArea is a known global (abap2UI5 CONTROL_GLOBAL target)');

    /* The targets upstream added after the frontend action layer was split per
     * action group. check-upstream could not see any of them while it still
     * read the single, now-emptied z2ui5_cl_ui5f_frontact_js class. */
    for (const [target, method] of [
      ['VIEW_SLOTS', 'destroy'], ['VIEW_SLOTS', 'updateModel'],
      ['ROUTER', 'sync'], ['MESSAGE_BOX', 'alert'], ['MESSAGE_BOX', 'confirm'],
    ]) {
      assert(checkAbapRules('client->follow_up_action( val = client->cs_event-control_global '
        + `t_arg = VALUE #( ( \`${target}\` ) ( \`${method}\` ) ) ).`)
        .filter((x) => x.type === 'invalid-frontend-action').length === 0,
        `invalid-frontend-action: ${target}.${method} is a known CONTROL_GLOBAL wire`);
    }
    /* Removed upstream (BREAKING, changelog): the constants are gone from
     * z2ui5_if_client, so naming them is broken code and must be reported. */
    for (const gone of ['NAV_TO_ROUTE']) {
      assert(!FRONTEND_EVENTS.includes(gone),
        `invalid-frontend-action: ${gone} was removed upstream and must not stay in the dispatch mirror`);
    }
    /* HISTORY_BACK left the removed list on 2026-08-31: the capability came
     * BACK upstream the same day and was renamed to HASH_BACK before release
     * (actions/Browser.js -> Router.navBack, the UI5 onNavBack pattern: one
     * consumed window.history.go(-1) with an optional fallback hash for the
     * cold deep link - it pairs with the app-owned hash routing, whose hash
     * change then round-trips like a browser Back). HASH_BACK is the
     * cs_event constant, so naming it is correct code; HISTORY_BACK never
     * shipped in a release and stays out of the dispatch mirror. */
    assert(FRONTEND_EVENTS.includes('HASH_BACK'),
      'invalid-frontend-action: HASH_BACK is the upstream dispatch entry and must be accepted');
    assert(!FRONTEND_EVENTS.includes('HISTORY_BACK'),
      'invalid-frontend-action: HISTORY_BACK was renamed to HASH_BACK before it ever shipped');
    /* Still released cs_event constants - the SERVER remaps either close onto
     * the VIEW_SLOTS destroy action, so an app using them is correct code. */
    for (const kept of ['POPUP_CLOSE', 'POPOVER_CLOSE']) {
      assert(FRONTEND_EVENT_ALIASES.includes(kept),
        `invalid-frontend-action: ${kept} is server-remapped, not gone - it must stay accepted`);
    }

    const css = wire.findings.filter((x) => x.type === 'unescaped-brace-in-style');
    assert(css.length === 1 && css[0].count === 2,
      `unescaped-brace-in-style: one finding per stylesheet, counting its braces (got ${css.length}/${css[0]?.count})`);
    assert(checkAbapRules('DATA(c) = `<style>.a \\{color:red\\}</style>`.').length === 0,
      'unescaped-brace-in-style: a correctly escaped stylesheet is silent');
    assert(checkAbapRules('DATA(c) = `<style>.a \\{x\\}</style>` && `toast {0} done`.')
      .filter((x) => x.type === 'unescaped-brace-in-style').length === 0,
      'unescaped-brace-in-style: a brace outside the <style> span is not CSS (the corpus false positive)');

    const collapsed = wire.findings.filter((x) => x.type === 'collapsed-brace-in-style');
    assert(collapsed.length === 1 && collapsed[0].count === 2,
      `collapsed-brace-in-style: the template form is caught where the source looks escaped (got ${collapsed.length})`);
    assert(checkAbapRules('DATA(c) = |<style>.a \\\\\\{x\\\\\\}</style>|.')
      .filter((x) => x.type === 'collapsed-brace-in-style').length === 0,
      'collapsed-brace-in-style: a doubled backslash survives the template and is not reported');
    assert(checkAbapRules('DATA(c) = `<style>.a \\{x\\}</style>`.')
      .filter((x) => x.type === 'collapsed-brace-in-style').length === 0,
      'collapsed-brace-in-style: the backtick form it recommends is not reported');

    /* The mirror image, and the rule that had no test at all until the coverage
     * gate at the end of this file went in. A backtick literal does no escape
     * processing, so the backslash is not an escape there - it lands in the
     * serialized attribute and UI5 sees `\{ path: … \}` where a binding should
     * be. Both correct spellings must stay silent, or the rule would report the
     * fix it recommends. */
    const escaped = (v) => checkAbapRules(`)->a( n = \`items\` v = ${v} )`)
      .filter((x) => x.type === 'escaped-brace-in-backtick');
    assert(escaped('`\\{ path: \'message>/\' \\}`').length === 1,
      'escaped-brace-in-backtick: a binding escaped inside a backtick literal is reported');
    assert(escaped('`{ path: \'message>/\' }`').length === 0,
      'escaped-brace-in-backtick: the plain-brace binding it recommends is silent');
    assert(escaped('|\\{ path: \'message>/\' \\}|').length === 0,
      'escaped-brace-in-backtick: the template form needs the escapes and is silent');
    assert(escaped('`<style>.a \\{color:red\\}</style>`').length === 0,
      'escaped-brace-in-backtick: an escaped stylesheet is not a binding and is left alone');

    const dead = wire.findings.filter((x) => x.type === 'unused-public-attribute');
    assert(dead.length === 1 && dead[0].member === 'ballast',
      `unused-public-attribute: only the untouched one (got ${dead.map((x) => x.member).join() || 'none'})`);
    assert(!dead.some((x) => ['name', 'counter'].includes(x.member)),
      'unused-public-attribute: a bound attribute and one used only in code are both left alone');
    assert(checkAbapRules('CLASS x DEFINITION. PROTECTED SECTION. DATA hidden TYPE string. ENDCLASS.')
      .filter((x) => x.type === 'unused-public-attribute').length === 0,
      'unused-public-attribute: a non-PUBLIC attribute is not transported and not judged');
});

// ------------------------------------------- rules distilled from the corpus ----
// popover-display-val, uncurated-formatter, hardcoded-binding-path,
// duplicate-for-iterator — lessons that bit the ai-demokit corpus, promoted
// from its repo-local pattern-lint into rules every consumer sees
section('popover-display-val', async () => {
    const { checkAbapRules } = await import('../observe.mjs');
    const { applyFixes } = await import('../../lib/fix.mjs');
    const srcC = fs.readFileSync(f('corpusrules.clas.abap'), 'utf8');
    const corpus = checkAbapSource(srcC);
    const hasC = (t, pred = () => true) => corpus.findings.some((x) => x.type === t && pred(x));

    assert(hasC('popover-display-val'),
      'popover-display-val: val = on popover_display is reported (it does not compile)');
    const pop = corpus.findings.find((x) => x.type === 'popover-display-val');
    assert(/popover_display\( xml = popover/.test(applyFixes(srcC, [pop]).output),
      'popover-display-val: --fix rewrites the parameter name to xml, the argument untouched');
    assert(!checkAbapRules('client->popup_display( val = popup->stringify( ) ).')
      .some((x) => x.type === 'popover-display-val'),
      'popover-display-val: popup_display( val = ) is the correct form and never reported');

    assert(hasC('uncurated-formatter', (x) => x.value === 'round2DP' && x.member === 'number'),
      'uncurated-formatter: a formatter outside the curated module is reported');
    assert(!hasC('uncurated-formatter', (x) => x.value === 'DateCreateObject'),
      'uncurated-formatter: a curated formatter is not');
    const ownModule = checkAbapSource(`
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`      v = \`sap.m\`
        )->a( n = \`xmlns:mvc\`  v = \`sap.ui.core.mvc\`
        )->a( n = \`xmlns:core\` v = \`sap.ui.core\`
        )->a( n = \`core:require\` v = \`{Formatter: 'my/app/formatter'}\`
        )->tag( \`Text\` )->a( n = \`text\` v = \`{ path: 'X', formatter: 'Formatter.myOwn' }\` ).
    client->view_display( view->stringify( ) ).`);
    assert(!ownModule.findings.some((x) => x.type === 'uncurated-formatter'),
      'uncurated-formatter: an alias pointed at the class\'s own module is not judged');

    assert(hasC('hardcoded-binding-path', (x) => x.value.includes('{/TITLE}')),
      'hardcoded-binding-path: a textual absolute path is reported');
    assert(!hasC('hardcoded-binding-path', (x) => x.value.includes('PRICE')),
      'hardcoded-binding-path: a relative complex-binding path is not absolute and not reported');
    assert(!checkAbapRules(`client->switch_default_model_path( ).
      view->tag( \`Panel\` )->a( n = \`binding\` v = \`{/Products('4711')}\` ).`)
      .some((x) => x.type === 'hardcoded-binding-path'),
      'hardcoded-binding-path: an OData entity path with a key predicate is exempt when the class switches its default model');
    /* The sheet has to be a VALUE for the exemption to be tested at all: the
     * rule judges only `v =` literals and t_arg rows, so a `DATA(css) = …`
     * assignment was never judged and this assertion passed with the
     * exemption gone (2026-10-12). The same CSS on a core:HTML `content`
     * reaches judge( ), where `<style` and the escaped brace stand it down. */
    assert(!checkAbapRules('view->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<style>.a \\{/* keep */color:red\\}</style>` ).')
      .some((x) => x.type === 'hardcoded-binding-path'),
      'hardcoded-binding-path: a CSS comment after a brace inside a <style> value is not a path');
    assert(checkAbapRules('view->tag( `Text` )->a( n = `text` v = `{/* keep */}` ).')
      .some((x) => x.type === 'hardcoded-binding-path'),
      'hardcoded-binding-path: the same characters outside a stylesheet and unescaped are still a path');

    assert(hasC('duplicate-for-iterator', (x) => x.member === 'i'),
      'duplicate-for-iterator: the reused iterator across two VALUE blocks in one method');
    assert(!checkAbapRules('METHOD a. x = VALUE #( FOR i = 1 UNTIL i > 2 ( ) ). ENDMETHOD.'
      + ' METHOD b. y = VALUE #( FOR i = 1 UNTIL i > 2 ( ) ). ENDMETHOD.')
      .some((x) => x.type === 'duplicate-for-iterator'),
      'duplicate-for-iterator: the same name in two different methods is fine');

    assert(checkAbapRules('view->tag( `Input` )->a( n = `liveChange` v = client->_event( `LIVE` ) ).')
      .some((x) => x.type === 'live-event-roundtrip' && x.member === 'liveChange'),
      'live-event-roundtrip: a liveChange wired to a backend round-trip is reported');
    assert(!checkAbapRules('view->tag( `Input` )->a( n = `liveChange` v = client->_event_client( `X` t_arg = VALUE #( ( `A` ) ) ) ).')
      .some((x) => x.type === 'live-event-roundtrip'),
      'live-event-roundtrip: a frontend-only _event_client wire is not judged');
    assert(!checkAbapRules('view->tag( `Input` )->a( n = `change` v = client->_event( `DONE` ) ).')
      .some((x) => x.type === 'live-event-roundtrip'),
      'live-event-roundtrip: the final-value event is the correct form and not reported');

    const flag = `CLASS zcl_f DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA check_initialized TYPE abap_bool.
      DATA cache_loaded TYPE abap_bool.
  ENDCLASS.
  CLASS zcl_f IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      IF check_initialized = abap_false.
        check_initialized = abap_true.
        client->view_display( render( ) ).
      ENDIF.
      IF cache_loaded IS INITIAL.
        cache_loaded = abap_true.
        load_cache( ).
      ENDIF.
    ENDMETHOD.
  ENDCLASS.`;
    const flags = checkAbapRules(flag);
    assert(flags.some((x) => x.type === 'manual-init-flag' && x.member === 'check_initialized'),
      'manual-init-flag: a boolean gating the first render is reported');
    assert(!flags.some((x) => x.type === 'manual-init-flag' && x.member === 'cache_loaded'),
      'manual-init-flag: a lazy-load guard that displays nothing is left alone');
    assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
      IF client->check_on_init( ).
        client->view_display( render( ) ).
      ENDIF.
    ENDMETHOD.`).some((x) => x.type === 'manual-init-flag'),
      'manual-init-flag: check_on_init( ) is the correct form and not reported');

    const refs = checkAbapRules(`CLASS zcl_r DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA mt_data TYPE REF TO data.
      DATA mo_app TYPE REF TO zcl_other_app.
      DATA t_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.
  ENDCLASS.
  CLASS zcl_r IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      view->ele( \`List\` )->a( n = \`items\` v = client->_bind( mt_data ) ).
      view->ele( \`List\` )->a( n = \`items\` v = client->_bind( mt_data->* ) ).
      view->ele( \`List\` )->a( n = \`items\` v = client->_bind( t_rows ) ).
      view->ele( \`Text\` )->a( n = \`text\` v = client->_bind( mo_app ) ).
    ENDMETHOD.
  ENDCLASS.`);
    assert(refs.filter((x) => x.type === 'binding-to-reference').map((x) => x.member).join() === 'mo_app',
      'binding-to-reference: the object reference is reported; a data reference (abap2UI5#2986), ref->* and a data attribute are not');

    const disabled = checkAbapSource(`CLASS zcl_d DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA can_save TYPE abap_bool.
  ENDCLASS.
  CLASS zcl_d IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->tag( \`Button\`
              )->a( n = \`press\`   v = client->_event( \`DEAD\` )
              )->a( n = \`enabled\` v = \`false\`
          )->tag( \`Button\`
              )->a( n = \`press\`   v = client->_event( \`LIVE\` )
              )->a( n = \`enabled\` v = client->_bind( can_save )
          )->end( ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`);
    const dead = disabled.findings.filter((x) => x.type === 'event-on-disabled-control');
    assert(dead.length === 1 && dead[0].member === 'press',
      'event-on-disabled-control: the literal-disabled button is reported, the bound one is not');

    /* The same button wired with follow_up_action( ), the name the corpora moved
     * to. The reconstructor knew _event/_event_client only, so such a handler
     * resolved to nothing and was DROPPED from the view - and every rule that
     * judges an event wire stopped seeing it. A dropped wire is silent: the port
     * looks clean instead of being judged. */
    const followUp = checkAbapSource(`
  CLASS zcl_f DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
  ENDCLASS.
  CLASS zcl_f IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->tag( \`Button\`
              )->a( n = \`press\`   v = client->follow_up_action( val = client->cs_event-popup_close )
              )->a( n = \`enabled\` v = \`false\`
          )->end( ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`);
    assert(followUp.docs[0]?.includes('press='),
      'follow_up_action: the wire reaches the reconstructed view instead of being dropped');
    assert(followUp.findings.some((x) => x.type === 'event-on-disabled-control'),
      'follow_up_action: a wire written with it is judged like an _event_client one');
});

// ------------------------------------------- obsolete z2ui5_if_client members ----
section('obsolete-model-update', async () => {
    const { checkAbapRules } = await import('../observe.mjs');
    const { applyFixes } = await import('../../lib/fix.mjs');
    const source = fs.readFileSync(f('obsolete.clas.abap'), 'utf8');
    const found = checkAbapRules(source);
    const of = (t, pred = () => true) => found.filter((x) => x.type === t && pred(x));

    const updates = of('obsolete-model-update');
    assert(updates.length === 5
      && ['view_model_update', 'nest_view_model_update', 'nest2_view_model_update',
        'popup_model_update', 'popover_model_update'].every(
        (m) => updates.some((x) => x.member === m)),
    `obsolete-model-update: all five empty push methods are reported (${updates.map((x) => x.member).join(', ')})`);

    assert(of('obsolete-frontend-event', (x) => x.member === '_event_client').length === 1,
      'obsolete-frontend-event: _event_client reported — follow_up_action reaches the same get_event_client');

    const fixed = applyFixes(source, found).output;
    assert(!/model_update/.test(fixed) && !/_event_client/.test(fixed),
      'obsolete: --fix deletes every model update and renames the frontend event');
    assert(/v = client->follow_up_action\( val = client->cs_event-popup_close \)/.test(fixed),
      'obsolete: the renamed call keeps its arguments untouched, in the view-attribute position');
    assert(!/\n[ \t]*\n[ \t]*\n/.test(fixed),
      'obsolete: a deleted call takes its whole line with it, leaving no blank run behind');
    assert(!checkAbapRules(fixed).some(
      (x) => x.type === 'obsolete-model-update' || x.type === 'obsolete-frontend-event'),
    'obsolete: the fixed source reports neither rule again');

    // a call that shares its line, or carries a trailing comment, keeps the
    // line: deleting a comment nobody asked about is a guess
    const shared = 'IF x = 1. client->view_model_update( ). ENDIF.';
    assert(applyFixes(shared, checkAbapRules(shared)).output === 'IF x = 1.  ENDIF.',
      'obsolete-model-update: on a shared line only the statement is cut');
    const commented = '    client->popup_model_update( ). " refresh\n';
    assert(applyFixes(commented, checkAbapRules(commented)).output === '     " refresh\n',
      'obsolete-model-update: a trailing comment survives the deletion');

    // the automatic push reaches the MAIN slot, which after a navigation still
    // holds the CALLED app's view - so this is no longer a re-display
    const navigated = `METHOD z2ui5_if_app~main.
      IF client->check_on_navigated( ).
        client->view_model_update( ).
      ENDIF.
    ENDMETHOD.`;
    assert(checkAbapRules(navigated).some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-view-display-on-navigated: view_model_update( ) no longer counts as a re-display');

    /* The ELSE of a COND is not the ELSE of the IF. Found on a real
     * documentation page: the branch below displays four statements after the
     * COND, and a scanner looking for the WORD ended the branch at the COND's
     * ELSE and reported a branch that never re-displays. A false positive on
     * idiomatic modern ABAP is the worst kind - it pushes people away from COND
     * to satisfy a rule about something else entirely. */
    const condElse = `METHOD z2ui5_if_app~main.
      IF client->check_on_navigated( ).
        DATA(status) = COND #( WHEN sy-index MOD 2 = 0 THEN \`open\` ELSE \`closed\` ).
        DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
        client->view_display( view->stringify( ) ).
      ENDIF.
    ENDMETHOD.`;
    assert(!checkAbapRules(condElse).some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-view-display-on-navigated: a COND ELSE inside the branch does not end it');

    /* And the switch is not stuck the other way: a branch that really does not
     * display is still reported when a COND sits in front of the gap. */
    const condElseNoDisplay = `METHOD z2ui5_if_app~main.
      IF client->check_on_navigated( ).
        DATA(status) = COND #( WHEN sy-index MOD 2 = 0 THEN \`open\` ELSE \`closed\` ).
      ENDIF.
    ENDMETHOD.`;
    assert(checkAbapRules(condElseNoDisplay).some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-view-display-on-navigated: a COND does not hide a branch that never displays');
});

// ------------------------------------------ source positions and declarations ----
section('unused-public-attribute', async () => {
    const { checkAbapRules } = await import('../observe.mjs');
    const { annotate } = await import('../../lib/findings.mjs');

    /* A finding has to point at the line it is about. publicAttributes measured
     * its offsets in the SECTION BODY but added the offset of the `PUBLIC
     * SECTION.` keyword, so every unused-public-attribute landed one line
     * early — invisible in a test that only checks the member name. */
    const attrs = `CLASS zcl_x DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA used TYPE string.
      DATA ballast TYPE string.
  ENDCLASS.
  CLASS zcl_x IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      used = \`x\`.
    ENDMETHOD.
  ENDCLASS.`;
    const dead = annotate(checkAbapRules(attrs).filter((x) => x.type === 'unused-public-attribute'), attrs);
    assert(dead.length === 1 && dead[0].member === 'ballast' && dead[0].line === 5,
      `unused-public-attribute: reported on the line it is declared on (line ${dead[0]?.line}, DATA ballast is line 5)`);

    /* A CHAINED declaration declares more than one name. Only the first was
     * collected, so the second boolean reached the view unreported while its
     * neighbour on the line above was caught. */
    const chained = `CLASS x DEFINITION PUBLIC.
    PUBLIC SECTION.
      DATA: first  TYPE abap_bool,
            second TYPE abap_bool.
  ENDCLASS.
  CLASS x IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      view->ele( n = \`View\` ns = \`mvc\`
          )->tag( \`Button\`
              )->a( n = \`visible\` v = first
              )->a( n = \`enabled\` v = second ).
      client->view_display( view->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`;
    const bools = checkAbapRules(chained).filter((x) => x.type === 'unconverted-abap-boolean');
    assert(bools.length === 2 && bools.some((x) => x.value === 'second'),
      `unconverted-abap-boolean: every name of a chained DATA: declaration is a known boolean (${bools.map((x) => x.value).join(', ')})`);

    /* The chain again, this time through the two SECTION-scoped collectors.
     * The case above went through instanceAttributes, which reads the whole
     * class definition and was always right; publicAttributes and
     * privateInstanceAttributes read one section and ended their block on `$`
     * under /m, which matches at every LINE end — so the lazy body stopped at
     * the first newline and both rules saw the first name of a chain and no
     * other. That is why this case looked covered and was not. */
    const sections = `CLASS x DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA: pub_one   TYPE string,
            pub_two   TYPE string,
            pub_three TYPE string.
    PRIVATE SECTION.
      DATA: priv_one TYPE string,
            priv_two TYPE string.
  ENDCLASS.
  CLASS x IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      priv_one = priv_two = pub_one.
    ENDMETHOD.
  ENDCLASS.`;
    const found = annotate(checkAbapRules(sections), sections);
    const unused = found.filter((x) => x.type === 'unused-public-attribute').map((x) => x.member);
    assert(unused.length === 2 && unused.includes('pub_two') && unused.includes('pub_three'),
      `unused-public-attribute: the second and third name of a chain are judged too (got ${unused.join(', ') || 'none'})`);
    assert(!unused.includes('pub_one'),
      'unused-public-attribute: a chained name that IS read stays unreported');
    const privs = found.filter((x) => x.type === 'private-app-attribute');
    assert(privs.length === 2 && privs.map((x) => x.member).join() === 'priv_one,priv_two',
      `private-app-attribute: every name of a chained PRIVATE declaration (got ${privs.map((x) => x.member).join() || 'none'})`);
    // the offsets are walked, not searched for, so each name keeps its own line
    assert(privs[0].line === 8 && privs[1].line === 9,
      `private-app-attribute: each name of a chain on its own line (got ${privs.map((x) => x.line).join()}, expected 8,9)`);
});

// ------------------------------------------------------- accessibility ----
section('xmlns (4)', async () => {
    const view = (leaf) => `CLASS x DEFINITION PUBLIC.
  ENDCLASS.
  CLASS x IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
  ${leaf}.
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`;
    const a11y = (leaf) => checkAbapSource(view(leaf), { render: false })
      .findings.filter((x) => x.type === 'missing-accessibility');

    /* sap.m.Image.decorative DEFAULTS TO TRUE, and UI5 then ignores `alt`
     * outright — so demanding one from an image without `decorative` asked for
     * an attribute the framework drops, on nearly every image in a corpus. */
    assert(!a11y('        )->tag( \`Image\` )->a( n = \`src\` v = \`x.png\` )').length,
      'missing-accessibility: an image without `decorative` is decorative by default and needs no alt');
    assert(a11y('        )->tag( \`Image\` )->a( n = \`src\` v = \`x.png\` )->a( n = \`decorative\` v = \`false\` )').length === 1,
      'missing-accessibility: an image declared MEANINGFUL and left without alt is the defect');
    assert(!a11y('        )->tag( \`Image\` )->a( n = \`src\` v = \`x.png\` )->a( n = \`decorative\` v = \`false\` )->a( n = \`alt\` v = \`Logo\` )').length,
      'missing-accessibility: …and an alt on it settles the matter');

    // three ways to name an icon-only button, not two
    assert(a11y('        )->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://add\` )').length === 1,
      'missing-accessibility: an icon-only button with no name at all is reported');
    for (const named of ['text', 'tooltip', 'ariaLabelledBy']) {
      assert(!a11y(`        )->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://add\` )->a( n = \`${named}\` v = \`x\` )`).length,
        `missing-accessibility: an icon button named through ${named} has an accessible name`);
    }
});

// ----------------------------------------------- a broken install answers ----
section('snapshot', async () => {
    const { loadSnapshot, snapshotVersion } = await import('../../lib/properties.mjs');
    /* The snapshot is the property gate's whole knowledge. A `--snapshot`
     * pointing at nothing, or an install that lost data/properties.json, used
     * to come out as a bare ENOENT stack trace — while the render gate's
     * missing dependencies have always answered with one actionable line. */
    let thrown = null;
    try { loadSnapshot('/nope/properties.json'); } catch (e) { thrown = e; }
    assert(thrown?.code === 'ERR_SNAPSHOT_MISSING' && /properties\.json/.test(thrown.message)
      && /--no-properties/.test(thrown.message),
    `snapshot: a missing snapshot is one actionable line, not a stack trace (${thrown?.code})`);
    assert(snapshotVersion('/nope/properties.json') === '',
      'snapshot: snapshotVersion returns the empty string it promises when the file is unreadable');
});

// ------------------------------------------------------- file collection ----
section('file collection', async () => {
    const { collectFiles } = await import('../observe.mjs');
    const os = await import('node:os');
    const dir = tempDir('a2ui5lint-collect-');
    const named = path.join(dir, 'my_app.abap');           // not abapGit's spelling
    fs.copyFileSync(f('viewbuilder.clas.abap'), named);
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(dir, 'z.testclasses.abap'));

    // a path the caller NAMED is meant - dropping it silently is the worst
    // answer a linter can give
    assert(collectFiles([named]).length === 1,
      'collectFiles: an explicitly named .abap file carrying a builder chain is checked');
    // …but a directory WALK keeps to the naming convention, which is what tells
    // an app class from an include or a generated artefact
    assert(collectFiles([dir]).length === 0,
      `collectFiles: a directory scan stays on .clas.abap (${collectFiles([dir]).join(', ')})`);
    assert(collectFiles([path.join(dir, 'z.testclasses.abap')]).length === 0,
      'collectFiles: a test include is never checked, not even when named');

    // the same file reached twice - `cli.mjs src src`, or a directory named
    // next to one of its own files - was checked, reported and COUNTED twice
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(dir, 'app.clas.abap'));
    const twice = collectFiles([dir, dir, path.join(dir, 'app.clas.abap')]);
    assert(twice.length === 1, `collectFiles: a file reached twice is checked once (${twice.join(', ')})`);
    // …and it comes back spelled the way it was reached: result.file travels
    // into --json and into the baseline keys, so the string is a contract
    const abs = collectFiles([path.resolve(f('good.clas.abap'))]);
    assert(abs.length === 1 && path.isAbsolute(abs[0]),
      `collectFiles: an absolute path stays absolute (${abs[0]})`);

    /* A symlink cycle. `statSync` follows links, so `deep/loop -> deep` used to
     * be an unbounded descent: the walk never finished, the run reported
     * nothing, and there is no output at all to read that from. Everything else
     * this gate can get wrong is at least visible as a verdict. */
    const deep = path.join(dir, 'deep');
    fs.mkdirSync(deep, { recursive: true });
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(deep, 'inner.clas.abap'));
    let linked = true;
    try { fs.symlinkSync(deep, path.join(deep, 'loop'), 'dir'); } catch { linked = false; }
    if (linked) {
      const cyc = collectFiles([deep]);
      assert(cyc.length === 1, `collectFiles: a symlink cycle terminates and collects each file once (${cyc.length})`);
      // a second link to the same directory is the same directory, not a copy
      fs.symlinkSync(deep, path.join(deep, 'again'), 'dir');
      assert(collectFiles([deep]).length === 1,
        'collectFiles: two links to one directory collapse onto its realpath');
    }

    // ignore: the repo-level counterpart of rules[id].exclude
    const gen = path.join(dir, 'generated');
    fs.mkdirSync(gen, { recursive: true });
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(gen, 'gen.clas.abap'));
    assert(collectFiles([gen]).length === 1, 'ignore: the generated tree is collected without a pattern');
    assert(collectFiles([dir], { ignore: ['generated'] }).every((p) => !p.includes('generated')),
      'ignore: a matching pattern drops the tree from a directory walk');
    assert(collectFiles([path.join(gen, 'gen.clas.abap')], { ignore: ['generated'] }).length === 1,
      'ignore: a path named on the command line is still checked - ignore filters a scan, not an argument');
    fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------- builder chain layout ----
section('chain-indentation', async () => {
    const { checkAbapRules } = await import('../observe.mjs');
    const { annotate } = await import('../../lib/findings.mjs');
    const source = fs.readFileSync(f('chainlayout.clas.abap'), 'utf8');
    const found = annotate(checkAbapRules(source).filter((x) => x.type.startsWith('chain-')), source);
    const of = (shape) => found.find((x) => x.shape === shape);

    assert(of('siblings') && of('siblings').value === '10' && of('siblings').count === 12,
      'chain-indentation: a sibling written a level out of line with its siblings is reported');
    assert(of('outdented') && of('outdented').member === 'att',
      'chain-indentation: an attribute written LEFT of the control it belongs to is reported');
    const crammed = found.find((x) => x.type === 'chain-element-per-line');
    assert(crammed && crammed.count === 3,
      'chain-element-per-line: three controls on one line of a multi-line chain, counted');
    /* An attribute sharing its control's line hides no level of the tree —
     * the compact form of half the samples, and every hit the first version
     * of this rule produced on the corpus. */
    const compact = `v->ele( n = \`View\` ns = \`mvc\`
        )->tag( \`Text\` )->a( n = \`text\` v = \`a\`
        )->tag( \`Text\` )->a( n = \`text\` v = \`b\` ).`;
    assert(!checkAbapRules(compact).some((x) => x.type === 'chain-element-per-line'),
      'chain-element-per-line: a control and its own attributes may share a line');
    // one finding per chain per rule: a shifted block makes everything below it
    // look wrong too, and forty findings for one mistake is not a report
    assert(found.filter((x) => x.type === 'chain-indentation').length === 2,
      `chain-indentation: one finding per chain (${found.length} in a fixture with two broken chains)`);
    // the fixture's fourth method keeps a TWO-space step throughout - the size
    // of the step is not what the rule is about, so it stays silent
    assert(!found.some((x) => x.line > 66),
      `chain layout: a chain that keeps its own two-space rhythm is never reported (${found.map((x) => x.line).join(', ')})`);

    // …and the canonical fixtures carry nothing
    for (const clean of ['good.clas.abap', 'viewbuilder.clas.abap']) {
      const src = fs.readFileSync(f(clean), 'utf8');
      assert(!checkAbapRules(src).some((x) => x.type.startsWith('chain-')),
        `chain layout: ${clean} is laid out the way the app guide writes it`);
    }
    // a chain on ONE line is a deliberate compact form, not a layout to judge
    const oneLiner = 'DATA(v) = z2ui5_cl_ui5_view_builder=>factory( )->ele( `View` )->a( n = `x` v = `y` )->tag( `Text` ).';
    assert(!checkAbapRules(oneLiner).some((x) => x.type.startsWith('chain-')),
      'chain layout: a single-line chain has no layout to be inconsistent with');

    // ---- chain-house-layout: the opt-in one ----------------------------------
    const { applyFixes } = await import('../../lib/fix.mjs');
    const ON = { rules: { 'chain-house-layout': 'warning' } };
    const drifted = `  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
            )->a( n = \`xmlns\` v = \`sap.m\`
            )->ele( \`Shell\` )->ele( \`Page\`
                    )->tag( \`Text\` )->a( n = \`text\` v = \`x\` ).`;

    assert(!checkAbapRules(drifted).some((x) => x.type === 'chain-house-layout'),
      'chain-house-layout: silent until a config asks for it');
    assert(checkAbapRules(drifted, ON).some((x) => x.type === 'chain-house-layout'),
      'chain-house-layout: switched on by a rules entry, it reports the drifted chain');
    assert(!checkAbapRules(drifted, { rules: { 'chain-house-layout': false } })
      .some((x) => x.type === 'chain-house-layout'),
    'chain-house-layout: `false` keeps it off even as an opt-in rule');

    // the fix is the canonical layout, and it is whitespace-only
    const houseFixed = applyFixes(drifted, checkAbapRules(drifted, ON)).output;
    const collapse = (t) => t.replace(/\s+/g, ' ').trim();
    assert(collapse(houseFixed) === collapse(drifted),
      'chain-house-layout: --fix changes whitespace only — the chain still builds the same view');
    // the statement is indented by two, so the tree starts at 2+4 and steps by four
    assert(/\n {6}\)->ele\( n = `View`/.test(houseFixed)
      && /\n {10}\)->a\( n = `xmlns`/.test(houseFixed)
      && /\n {10}\)->ele\( `Shell`/.test(houseFixed)
      && /\n {14}\)->ele\( `Page`/.test(houseFixed)
      && /\n {18}\)->tag\( `Text`/.test(houseFixed)
      && /\n {22}\)->a\( n = `text`/.test(houseFixed),
    `chain-house-layout: --fix gives every call its own line at four spaces per level\n${houseFixed}`);
    assert(!checkAbapRules(houseFixed, ON).some((x) => x.type === 'chain-house-layout'),
      'chain-house-layout: the fixed chain reports nothing on a second run');

    // the compact attribute form chain-element-per-line allows IS reported here —
    // that difference is the whole point of the rule being separate and opt-in
    assert(checkAbapRules(compact, ON).some((x) => x.type === 'chain-house-layout'),
      'chain-house-layout: stricter than chain-element-per-line — an attribute gets its own line too');

    // a two-space chain is fine for its neighbours and not for this one
    for (const clean of ['good.clas.abap', 'viewbuilder.clas.abap']) {
      const src = fs.readFileSync(f(clean), 'utf8');
      const out = applyFixes(src, checkAbapRules(src, ON)).output;
      assert(collapse(out) === collapse(src),
        `chain-house-layout: the fix stays whitespace-only on ${clean}`);
    }
});

// ------------------------------- the view builder (z2ui5_cl_ui5_view_builder) ----
section('view builder', async () => {
    const { checkAbapRules } = await import('../observe.mjs');
    const { applyFixes } = await import('../../lib/fix.mjs');
    const { dialectOf } = await import('../../lib/builders.mjs');
    const source = fs.readFileSync(f('viewbuilder.clas.abap'), 'utf8');
    const vb = checkAbapSource(source, { render: false });
    const ai = prepareAbap(fs.readFileSync(f('good.clas.abap'), 'utf8'));

    assert(vb.usesBuilder && vb.docs.length === 1,
      'view builder: an ele/tag/a/end class is recognised and reconstructed');
    /* The same view written as one flat chain and as a chain that hands a
     * handle to a helper has to come out as the SAME document — that is the
     * whole claim of the handle-aware reconstruction. The helper fixture adds
     * one boolean attribute, and nothing else. */
    assert(vb.docs[0].replace(' editable="true"', '') === ai.docs[0],
      `view builder: a helper-handle chain rebuilds the same document as a flat one\n      ${vb.docs[0]}\n      ${ai.docs[0]}`);
    assert(vb.docs[0].includes('editable="true"'),
      'view builder: a( b = flag ) reaches the view as a rendered boolean');
    assert(vb.helperTokens === 0,
      'view builder: a helper typed TYPE REF TO z2ui5_cl_ui5_view_builder is followed, not counted as unattributable');
    assert(vb.model.NAME === 'world' && vb.findings.length === 0,
      `view builder: the model is derived and the fixture is clean (${vb.findings.map((x) => x.type).join(', ')})`);

    // every source-reading rule follows the dialect too — ids, booleans, wires
    const wired = `CLASS zcl_x DEFINITION PUBLIC.
  ENDCLASS.
  CLASS zcl_x IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA flag TYPE abap_bool.
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      view->ele( n = \`View\` ns = \`mvc\`
          )->tag( \`Button\`
              )->a( n = \`id\`      v = \`btnOk\`
              )->a( n = \`visible\` v = flag ).
      client->follow_up_action( val = client->cs_event-control_by_id
                                t_arg = VALUE #( ( \`btnok\` ) ( \`focus\` ) ) ).
      client->view_display( view->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`;
    const found = checkAbapRules(wired);
    const id = found.find((x) => x.type === 'frontend-action-unknown-id');
    assert(id && id.allowed.includes('btnOk'),
      'view builder: ids written with a( n = `id` ) are collected, so a wrong wire is still caught');
    const bool = found.find((x) => x.type === 'unconverted-abap-boolean');
    assert(bool && /a\( b = /.test(bool.fixHint),
      'view builder: an unconverted boolean names the builder\'s own correction');
    assert(/a\( n = `visible` b = flag/.test(applyFixes(wired, found).output),
      'view builder: --fix moves the flag onto the b parameter instead of wrapping it');

    assert(dialectOf('z2ui5_cl_ui5_view_builder=>factory( )').verbs === '(ele|tag|end|a|stringify)',
      'view builder: a source is read in the dialect its factory names');
});

// ------------------------------------------------- the FROZEN view builder ----
/* An app on `z2ui5_cl_xml_view` was not merely unjudged, it was invisible:
 * collectFiles kept a class only when it called a CURRENT builder's factory, so
 * a whole app on the retired API produced "no checkable app classes" and exit 0.
 * That is the shape of miss this linter exists to prevent, and it is aimed at
 * the most common wrong answer there is - the old API is what nearly all public
 * abap2UI5 material shows, and therefore what a language model writes. */
section('frozen view builder', async () => {
    const { checkAbapSource, collectFiles } = await import('../observe.mjs');
    const { frozenBuilderOf, FROZEN_BUILDERS } = await import('../../lib/builders.mjs');
    const os = await import('node:os');
    const source = fs.readFileSync(f('frozenbuilder.clas.abap'), 'utf8');

    const found = checkAbapSource(source, { render: false }).findings;
    const frozen = found.find((x) => x.type === 'frozen-view-builder');
    assert(frozen && frozen.value === 'z2ui5_cl_xml_view',
      'frozen builder: a class on z2ui5_cl_xml_view is reported, not skipped');
    assert(frozen.severity === 'warning',
      `frozen builder: a warning - the class compiles and renders today, and breaks on the upgrade the deprecation announces (got ${frozen.severity})`);
    assert(/recommended/.test(frozen.message) && !/DEPRECATED/.test(frozen.message),
      'frozen builder: the message RECOMMENDS the current builder - the old one keeps working, so it is not shouted at');
    assert(/no view check ran here/.test(frozen.message),
      'frozen builder: the message says what was not judged, not just that a name is old');
    assert(/z2ui5_cl_ui5_view_builder/.test(frozen.message),
      'frozen builder: the message names what to switch to, and what switching buys');
    assert(frozen.line === 13,
      `frozen builder: reported at the factory call, not at line 1 (got ${frozen.line})`);

    /* And ONLY that. The other ABAP rules model the current dialect; run over
     * `page( )`/`button( )` they would be guessing, and confident noise is a
     * worse trade than the silence it replaces. */
    assert(found.length === 1,
      `frozen builder: exactly one finding, no guesses about an API the reconstructor does not model (got ${found.map((x) => x.type).join(', ') || 'none'})`);

    // the collection half - the actual defect, and the half a findings test misses
    const dir = tempDir('a2ui5-frozen-');
    fs.writeFileSync(path.join(dir, 'zcl_frozen_app.clas.abap'), source);
    assert(collectFiles([dir]).length === 1,
      'frozen builder: the file is collected — before this, the run said "no checkable app classes"');
    fs.rmSync(dir, { recursive: true, force: true });

    // negative: the current builder is not mistaken for the frozen one, and a
    // mention that is not a factory call is not a view being built with it
    assert(frozenBuilderOf(fs.readFileSync(f('good.clas.abap'), 'utf8')) === null,
      'frozen builder: a class on the current builder is not reported');
    assert(frozenBuilderOf('" see z2ui5_cl_xml_view for the old way') === null,
      'frozen builder: naming the class without calling its factory builds no view');
    assert(FROZEN_BUILDERS.includes('z2ui5_cl_xml_view_cc'),
      'frozen builder: the custom-control half of the old API counts too');
});

// ------------------------------------------ the released API surface (src/02) ----
section('non-released-api', async () => {
    const { checkAbapRules } = await import('../observe.mjs');
    const { apiVerdict, RELEASED_OBJECTS } = await import('../../lib/released-api.mjs');
    const source = fs.readFileSync(f('releasedapi.clas.abap'), 'utf8');
    const named = checkAbapRules(source)
      .filter((x) => x.type === 'non-released-api').map((x) => x.value);

    for (const [name, area] of [
      ['z2ui5_cl_util', 'abap2UI5-ext'],       // retired utility class, moved out of the core
      ['z2ui5_cl_pop_to_confirm', 'src/99/02'], // built-in popup, replaced by the addon
      ['z2ui5_cl_ajson', 'src/00/01'],          // vendored copy, renamed on every sync
      ['z2ui5_if_ajson', 'src/00/01'],          // …in a declaration, not only a call
      ['z2ui5_cl_ui5_client', 'src/01'],        // the core engine
    ]) {
      assert(named.includes(name) && apiVerdict(name).area === area,
        `non-released-api: ${name} is reported, and placed in ${area}`);
    }

    for (const name of RELEASED_OBJECTS) {
      assert(apiVerdict(name) === null, `non-released-api: the released ${name} is never reported`);
    }
    // z2ui5_if_types WAS released, because the released client->get( ) returned
    // z2ui5_if_types=>ty_s_get and an app declaring a variable of that type
    // could not avoid the name. Upstream moved every type onto the object that
    // uses it and retired the shared interface into src/99 - it still SHIPS, so
    // an app naming it still compiles, which is exactly why it has to be
    // reported now, with the object the types moved to.
    assert(named.includes('z2ui5_if_types')
      && apiVerdict('z2ui5_if_types').area === 'src/99'
      && apiVerdict('z2ui5_if_types').replacement === 'z2ui5_if_client',
      'non-released-api: the retired z2ui5_if_types is reported, pointing at z2ui5_if_client');
    assert(apiVerdict('z2ui5_if_exit')?.replacement === 'z2ui5_if_ui5_exit'
      && apiVerdict('z2ui5_if_ui5_exit') === null,
      'non-released-api: the exit interface reports under its old name and is silent under the new one');
    // src/99/01 left the core for abap2UI5-ext: still reported, as moved -
    // not as frozen legacy that ships, and the table not as a framework table
    for (const name of ['z2ui5_cl_util', 'z2ui5_cx_util_error', 'z2ui5_t_91']) {
      const v = apiVerdict(name);
      assert(v?.area === 'abap2UI5-ext' && v.moved === true && v.frozen === false,
        `non-released-api: ${name} is reported as moved to abap2UI5-ext`);
    }
    // an app\'s own z2ui5_-prefixed class matches no framework family
    assert(!named.includes('z2ui5_cl_demo_app_042'),
      'non-released-api: a name outside every framework prefix family is somebody else\'s class');
    // a legacy name inside a `…` literal is text, not a reference
    assert(!named.includes('z2ui5_cl_util_log'),
      'non-released-api: a framework name inside a string literal is not a use of it');

    const own = `CLASS z2ui5_cl_ui5_app_start DEFINITION PUBLIC.
  ENDCLASS.
  CLASS z2ui5_cl_ui5_app_start IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(view) = z2ui5_cl_xml_view=>factory( ).
    ENDMETHOD.
  ENDCLASS.`;
    const inOwn = checkAbapRules(own).filter((x) => x.type === 'non-released-api');
    assert(inOwn.length === 1 && inOwn[0].value === 'z2ui5_cl_xml_view',
      'non-released-api: a class does not use ITSELF — only the frozen builder it names is reported');
    assert(inOwn[0].replacement === 'z2ui5_cl_ui5_view_builder',
      'non-released-api: the frozen view builder points at its successor');
});

// --------------------------------------------------------- lifecycle rules ----
section('separate-lifecycle-ifs', async () => {
    const lc = checkAbapSource(fs.readFileSync(f('lifecycle.clas.abap'), 'utf8'));
    assert(lc.findings.some((x) => x.type === 'separate-lifecycle-ifs' && x.member === 'check_on_navigated'),
      'separate-lifecycle-ifs: a second plain IF on a lifecycle check is reported');
    assert(lc.findings.some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-view-display-on-navigated: a navigated branch that never re-displays');

    const chained = `METHOD z2ui5_if_app~main.
      IF client->check_on_init( ).
        client->view_display( render( ) ).
      ELSEIF client->check_on_navigated( ).
        IF picked IS INITIAL.
          picked = \`x\`.
        ENDIF.
        client->view_display( render( ) ).
      ENDIF.
    ENDMETHOD.`;
    const { checkAbapRules } = await import('../observe.mjs');
    assert(!checkAbapRules(chained).some((x) => x.type === 'separate-lifecycle-ifs'),
      'separate-lifecycle-ifs: an IF/ELSEIF chain is the correct form and not reported');
    assert(!checkAbapRules(chained).some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-view-display-on-navigated: an inner IF does not end the branch early — the display after it counts');

    /* The branch usually DELEGATES - `on_navigation( )`, which calls
     * `view_display( )`, which displays. Reading only the branch text called
     * four correct samples broken and offered a fix that would have displayed
     * the view twice. */
    const delegated = `METHOD z2ui5_if_app~main.
      IF client->check_on_init( ).
        paint( ).
      ELSEIF client->check_on_navigated( ).
        on_navigation( ).
      ENDIF.
    ENDMETHOD.
    METHOD on_navigation.
      client->message_toast_display( \`back\` ).
      paint( ).
    ENDMETHOD.
    METHOD paint.
      client->view_display( render( ) ).
    ENDMETHOD.`;
    assert(!checkAbapRules(delegated).some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-view-display-on-navigated: a branch that delegates two levels down to a display still counts');
    const delegatedSilent = delegated.replace('client->view_display( render( ) ).', 'rendered = abap_true.');
    // `paint` rather than `view_display` on purpose: the method NAME must not be
    // what satisfies the rule, or the negative half proves nothing
    assert(checkAbapRules(delegatedSilent).some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-view-display-on-navigated: following the call does not make the rule toothless — no display anywhere is still reported');

    /* An ABAP keyword inside a STRING LITERAL is not structure. A MessageStrip
     * whose text reads "…so the state can be shared with someone else. Enter a
     * quantity…" ended its enclosing IF branch at that `else`, four statements
     * before the real ENDIF - and the view_display( ) after it stopped counting.
     * Any English sentence long enough contains one of these words. */
    const prose = `METHOD z2ui5_if_app~main.
      IF client->check_on_navigated( ).
        DATA(view) = z2ui5_cl_ui5_view_builder=>factory(
            )->ele( n = \`View\` ns = \`mvc\`
                )->a( n = \`xmlns\` v = \`sap.m\`
                )->tag( \`MessageStrip\`
                    )->a( n = \`text\` v = \`share the state with someone else. Enter a quantity, if you like, and press it\` ).
        client->view_display( view->stringify( ) ).
      ENDIF.
    ENDMETHOD.`;
    assert(!checkAbapRules(prose).some((x) => x.type === 'missing-view-display-on-navigated'),
      'ifBranchEnd: `else`/`if` inside a literal is prose, not the end of the branch');

    /* ---- missing-on-navigated-branch: the same defect, one step earlier ----
     *
     * The rule above needs a branch to judge. The far more common shape in the
     * wild has none at all - 576 classes across the three sample repositories -
     * and it is invisible until something navigates into the app. */
    const NAV = 'missing-on-navigated-branch';
    const canonical = `METHOD z2ui5_if_app~main.
      me->client = client.
      IF client->check_on_init( ).
        model_init( ).
        view_display( ).
      ELSEIF client->check_on_event( ).
        on_event( ).
      ENDIF.
    ENDMETHOD.
    METHOD view_display.
      client->view_display( render( ) ).
    ENDMETHOD.`;
    assert(checkAbapRules(canonical).some((x) => x.type === NAV),
      'missing-on-navigated-branch: the two-branch dispatcher every guide used to show');
    assert(!checkAbapRules(canonical).some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-on-navigated-branch: the branch-that-exists rule stays quiet - the two never both fire');
    assert(!checkAbapRules(canonical.replace(
      'ELSEIF client->check_on_event( ).',
      'ELSEIF client->check_on_navigated( ).\n      view_display( ).\n    ELSEIF client->check_on_event( ).')).some((x) => x.type === NAV),
    'missing-on-navigated-branch: adding the branch clears it');

    // a static app - no data, no events - is the same defect with one branch
    assert(checkAbapRules(`METHOD z2ui5_if_app~main.
      IF client->check_on_init( ).
        client->view_display( render( ) ).
      ENDIF.
    ENDMETHOD.`).some((x) => x.type === NAV),
    'missing-on-navigated-branch: a lone check_on_init branch is not exempt for being simple');

    /* The reason this is not a text search for the word. An app whose display
     * is NOT gated by the lifecycle re-displays on EVERY roundtrip, navigated
     * ones included - samples/z2ui5_cl_smp_app_025 is exactly this shape, and
     * a rule reading the text alone called it broken. */
    assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
      me->client = client.
      IF client->check_on_init( ).
        name = \`world\`.
      ELSEIF client->check_on_event( ).
        on_event( ).
      ENDIF.
      view_display( ).
    ENDMETHOD.
    METHOD view_display.
      client->view_display( render( ) ).
    ENDMETHOD.`).some((x) => x.type === NAV),
    'missing-on-navigated-branch: an ungated display after the chain covers every roundtrip');

    /* The popup-helper shape: display once, then leave on everything else.
     * abap2UI5's own z2ui5_cl_pop_data is written this way. */
    assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
      me->client = client.
      IF client->check_on_init( ).
        display( ).
        RETURN.
      ENDIF.
      client->nav_app_leave( ).
    ENDMETHOD.
    METHOD display.
      client->popup_display( render( ) ).
    ENDMETHOD.`).some((x) => x.type === NAV),
    'missing-on-navigated-branch: a helper that leaves on every other roundtrip needs no branch');

    /* The client handle is not always spelled `client`. samples-stack's app 319
     * calls it `m_client`, and every lifecycle rule used to hard-code
     * `client->` - so that class had no navigated branch and NO rule saw it,
     * neither this one nor separate-lifecycle-ifs. The handle is matched by
     * shape now. */
    const mclient = canonical.replace(/client->/g, 'm_client->').replace('me->client = client.', 'm_client = client.');
    assert(checkAbapRules(mclient).some((x) => x.type === NAV),
      'missing-on-navigated-branch: found through a handle named m_client, not only client');
    assert(!checkAbapRules(mclient.replace(
      'ELSEIF m_client->check_on_event( ).',
      'ELSEIF m_client->check_on_navigated( ).\n      view_display( ).\n    ELSEIF m_client->check_on_event( ).')).some((x) => x.type === NAV),
    'missing-on-navigated-branch: and cleared through it too');
    assert(checkAbapRules(`METHOD z2ui5_if_app~main.
      IF mo_client->check_on_init( ).
        on_init( ).
      ENDIF.
      IF mo_client->check_on_navigated( ).
        view_display( ).
      ENDIF.
    ENDMETHOD.`).some((x) => x.type === 'separate-lifecycle-ifs'),
    'separate-lifecycle-ifs: found through a handle named mo_client too');

    // a class that never displays anything is not an app to judge - that is
    // view-never-displayed's finding, and two rules for one class is a report
    // nobody can act on
    assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
      IF client->check_on_init( ).
        counter = counter + 1.
      ENDIF.
    ENDMETHOD.`).some((x) => x.type === NAV),
    'missing-on-navigated-branch: a class with no display anywhere is a helper, not a blank app');

    // the OR form is a navigated branch too, spelled differently
    assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
      IF client->check_on_init( ) OR client->check_on_navigated( ).
        client->view_display( render( ) ).
      ENDIF.
    ENDMETHOD.`).some((x) => x.type === NAV),
    'missing-on-navigated-branch: check_on_navigated in an OR condition counts');

    /* ifBlockEnd has to step OVER the ELSEIF branches of the construct it is
     * cutting, or the second branch is read as ungated code and every
     * dispatcher looks covered by its own on_event branch. */
    assert(checkAbapRules(`METHOD z2ui5_if_app~main.
      IF client->check_on_init( ).
        IF flag = abap_true.
          client->view_display( render( ) ).
        ENDIF.
      ELSEIF client->check_on_event( ).
        client->view_display( render( ) ).
      ENDIF.
    ENDMETHOD.`).some((x) => x.type === NAV),
    'missing-on-navigated-branch: a nested IF inside the branch does not end the construct early');

    /* An `exclude` is matched against the path the runner REACHED the file by,
     * which is absolute when `paths` comes from a config file - while the report
     * prints it relative to the cwd. A pattern written from what you can read in
     * the report used to match nothing, silently. */
    {
      const { applyRules } = await import('../../lib/findings.mjs');
      const one = [{ type: 'unknown-control' }];
      /* An exclude has to mean the same thing however the run was started. The
       * path a finding carries is absolute or relative depending on the
       * invocation, and BOTH spellings of the pattern were in the README and in
       * real configs: `/src/02/` with abaplint's leading slash (linter#35, where
       * `abap2ui5lint src` reported 25 findings the config had waived), and
       * `^src/00/98/` written the way the report prints it. */
      for (const [pattern, what] of [
        ['^src/00/98/', 'written the way the report prints the path'],
        ['/src/00/98/', "written with abaplint's leading slash"],
      ]) {
        const rules = { 'unknown-control': { exclude: [pattern] } };
        for (const [form, how] of [
          [`${process.cwd()}/src/00/98/app.clas.abap`, 'an absolute path'],
          ['src/00/98/app.clas.abap', 'a relative path'],
          ['./src/00/98/app.clas.abap', 'a dot-prefixed path'],
        ]) {
          assert(applyRules([...one], rules, form).length === 0,
            `rules.exclude: "${pattern}" (${what}) excludes the file when it arrives as ${how}`);
        }
        /* The Windows spelling, asserted on every platform. `path.resolve` and
         * `path.relative` hand back `\` there, so all three forms above carried
         * backslashes and a `/`-written pattern matched none of them - three of
         * the windows-latest failures in linter#67. Writing the separator by
         * hand is what makes that reproducible on Linux; without this the
         * regression is only visible on one leg of the matrix.
         *
         * The relative form is the one that carries: a `\`-separated path under
         * the cwd reaches both patterns (itself for `^src/`, its resolved form
         * for `/src/`). A fabricated `C:\...` cannot - `path.relative` has no
         * way to reduce a foreign drive to `src/00/98/`, on either platform -
         * so asserting it here would test the fixture, not the fix. */
        assert(applyRules([...one], rules, 'src\\00\\98\\app.clas.abap').length === 0,
          `rules.exclude: "${pattern}" excludes a backslash-separated path (Windows)`);

        assert(applyRules([...one], rules, `${process.cwd()}/src/01/app.clas.abap`).length === 1,
          `rules.exclude: "${pattern}" still only excludes what it names`);
        assert(applyRules([...one], rules, 'src/01/app.clas.abap').length === 1,
          `rules.exclude: "${pattern}" still only excludes what it names, relative too`);
        assert(applyRules([...one], rules, 'src\\01\\app.clas.abap').length === 1,
          `rules.exclude: "${pattern}" still only excludes what it names, backslashes too`);
      }
      /* The compiled config is memoized per (rules object, rule id) - one
       * rules object walked over many files must still decide per FILE, and
       * a severity override must survive the memo on the second file too. */
      {
        const rules = { 'unknown-control': { severity: 'hint', exclude: ['^src/00/'] } };
        assert(applyRules([...one], rules, 'src/00/a.clas.abap').length === 0,
          'rules.exclude: memoized config still excludes the matching file');
        const kept = applyRules([{ type: 'unknown-control' }], rules, 'src/01/b.clas.abap');
        assert(kept.length === 1 && kept[0].severity === 'hint',
          'rules.exclude: memoized config keeps the non-matching file, severity override intact');
      }
    }
    // the guard idiom is exclusive by construction: good.clas.abap opens with
    // `IF check_on_event( \`GO\` ). RETURN. ENDIF.` before its init IF
    assert(!checkAbapSource(fs.readFileSync(f('good.clas.abap'), 'utf8')).findings
      .some((x) => x.type === 'separate-lifecycle-ifs'),
      'separate-lifecycle-ifs: an IF block that RETURNs (the guard idiom) does not count');
});

// -------------------------------- event-parameter existence + closed gaps ----
section('xmlns (5)', async () => {
    const paramFindings = (control, event, param, type) => checkAbapSource(`
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`${control}\`
            )->a( n = \`${event}\` v = client->_event( val = \`GO\` t_arg = VALUE #( ( \`\${$parameters>/${param}}\` ) ) ) ).
    client->view_display( view->stringify( ) ).`)
      .findings.filter((x) => x.type === type);

    const typo = paramFindings('SearchField', 'search', 'quer', 'unknown-event-parameter');
    assert(typo.length === 1 && typo[0].allowed.includes('query'),
      'unknown event param: a typo is reported, carrying the names the event does declare');
    assert(!paramFindings('SearchField', 'search', 'query', 'unknown-event-parameter').length,
      'unknown event param: a declared parameter without @since is known, not unknown');
    assert(!paramFindings('Button', 'press', 'anything', 'unknown-event-parameter').length,
      'unknown event param: an event that declares no parameters block is never judged');
    assert(paramFindings('SearchField', 'search', 'searchButtonPressed', 'event-parameter-too-new').length === 1
      && !paramFindings('SearchField', 'search', 'searchButtonPressed', 'unknown-event-parameter').length,
      'unknown event param: a too-new parameter reports as too-new, never doubly as unknown');
    // the false positive the first corpus run produced: a subclass widening an
    // inherited event without redeclaring it (DateRangeSelection change from/to)
    assert(!paramFindings('DateRangeSelection', 'change', 'from', 'unknown-event-parameter').length,
      'unknown event param: an event the control does not declare itself is not judged');

    // --- the two rules that only had negative/severity assertions -------------
    const tooNew = checkAbapSource(view('  )->tag( `IllustratedMessage` )')).findings
      .filter((x) => x.type === 'control-too-new');
    assert(tooNew.length === 1 && tooNew[0].control === 'sap.m.IllustratedMessage' && tooNew[0].since === '1.98',
      `control-too-new: a control introduced after the floor is reported with its @since (got ${tooNew.map((x) => `${x.control}@${x.since}`).join() || 'none'})`);

    const brokenExpr = checkAbapSource(view('  )->tag( `Button` )->a( n = `visible` v = `{= ( 1 }` )')).findings
      .filter((x) => x.type === 'invalid-expression-binding');
    assert(brokenExpr.length === 1 && brokenExpr[0].member === 'visible',
      'invalid-expression-binding: unbalanced parens in {= … } are reported');

    // missing-required-aggregation reaches subclasses through the chain — the
    // REQUIRED_WITH table needs no TreeTable row of its own
    const tree = checkAbapSource(`
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`       v = \`sap.m\`
        )->a( n = \`xmlns:mvc\`   v = \`sap.ui.core.mvc\`
        )->a( n = \`xmlns:table\` v = \`sap.ui.table\`
        )->ele( n = \`TreeTable\` ns = \`table\` )->a( n = \`rows\` v = \`{/T_X}\` ).
    client->view_display( v->stringify( ) ).`);
    assert(tree.findings.some((x) => x.type === 'missing-required-aggregation' && x.member === 'columns'),
      'missing-required-aggregation: a TreeTable inherits the Table rows→columns rule through the chain');
});
}
