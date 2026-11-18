/*
 * The replay runs every arm of an IF / CASE (abap2UI5-addons/abap-cloud-gui,
 * linter 0.11.0), and two things assumed that all of them run:
 *
 *   - duplicate-property counted `type` set in an IF and in its ELSEIF as a
 *     second write on the control - the builder asserts on a REAL second
 *     write, and at runtime only one arm writes. A write is now judged
 *     against the arms it sits in.
 *   - a handle captured in two arms at two different places of the tree
 *     (the new Input in one, its container in the other) was the last arm's
 *     after the branch, and what was built on it then landed where only the
 *     other arm puts it - a `layoutData` in a SimpleForm, an
 *     unknown-aggregation and a render error on a correct class. Such a
 *     handle is dropped after the branch and what is built on it counted as
 *     a call the replay cannot place: the render is skipped, not guessed.
 *
 * Fixture: test/fixtures/componentview.clas.abap. See test/review/README.md.
 */
import fs from 'node:fs';

export default async function ({ section, assert, f, checkAbapSource, prepareAbap }) {
  const opts = { render: false, properties: true };
  const dupes = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'duplicate-property').map((x) => x.member);
  const app = (body) => `CLASS zcl_arms DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_mode TYPE string.\nENDCLASS.\n\nCLASS zcl_arms IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    DATA(page) = view->ele( n = \`View\` ns = \`mvc\`\n        )->a( n = \`xmlns\`     v = \`sap.m\`\n        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`\n        )->ele( \`Page\` ).\n    page->tag( \`Input\`\n        )->a( n = \`value\` v = client->_bind_edit( mv_mode ) ).\n${body}\n    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n`;
  const SRC = fs.readFileSync(f('componentview.clas.abap'), 'utf8');

  section('duplicate-property: the same property in exclusive arms of one IF or CASE is set once', () => {
    assert(dupes(app('    IF mv_mode = `N`.\n      page->a( n = `type` v = `Number` ).\n    ELSEIF mv_mode = `P`.\n      page->a( n = `type` v = `Password` ).\n    ELSE.\n      page->a( n = `type` v = `Text` ).\n    ENDIF.')).length === 0,
      'IF / ELSEIF / ELSE: one write reaches the control');
    assert(dupes(app('    CASE mv_mode.\n      WHEN `N`.\n        page->a( n = `type` v = `Number` ).\n      WHEN OTHERS.\n        page->a( n = `type` v = `Text` ).\n    ENDCASE.')).length === 0,
      'CASE / WHEN: one write reaches the control');
    assert(dupes(SRC).length === 0, 'in a helper the replay enters (the fixture\'s render_field( ))');
  });

  section('duplicate-property: writes that can both run are still reported', () => {
    assert(dupes(app('    IF mv_mode = `N`.\n      page->a( n = `type` v = `Number` ).\n    ENDIF.\n    page->a( n = `type` v = `Text` ).')).join() === 'type',
      'one in an IF, one after it');
    assert(dupes(app('    page->a( n = `type` v = `Text` ).\n    IF mv_mode = `N`.\n      page->a( n = `type` v = `Number` ).\n    ENDIF.')).join() === 'type',
      'one before an IF, one in it');
    assert(dupes(app('    IF mv_mode = `N`.\n      page->a( n = `type` v = `Number` ).\n      page->a( n = `type` v = `Text` ).\n    ENDIF.')).join() === 'type',
      'two in the same arm');
    assert(dupes(app('    IF mv_mode = `N`.\n      page->a( n = `type` v = `Number` ).\n      IF mv_mode IS NOT INITIAL.\n        page->a( n = `type` v = `Text` ).\n      ENDIF.\n    ENDIF.')).join() === 'type',
      'an arm and an IF nested in it');
    assert(dupes(app('    IF mv_mode = `N`.\n      page->a( n = `type` v = `Number` ).\n    ELSE.\n      page->a( n = `type` v = `Text` ).\n    ENDIF.\n    page->a( n = `type` v = `Email` ).')).join() === 'type',
      'a write after the branch meets both arms');
  });

  section('reconstruct: a handle two arms leave at different places is not built on after the branch', () => {
    const prep = prepareAbap(SRC);
    assert(prep.docs.length === 1, `the component's stringify( ) reconstructs its view (got ${prep.docs.length})`);
    assert(!prep.docs[0].includes('layoutData'), 'the layoutData only the help arm adds is not put into the form');
    assert(prep.helperTokens > 0, 'what is built on the ambiguous handle counts as unplaced, so the render is skipped');
    assert(/<HBox><Input\/><Button icon="sap-icon:\/\/filter"\/><\/HBox>/.test(prep.docs[0]), 'a handle only one arm captures is built on as before');
    const r = checkAbapSource(SRC, opts);
    assert(!r.findings.some((x) => x.type === 'unknown-aggregation'), 'no unknown-aggregation on the form');
    const same = app('    DATA lo TYPE REF TO z2ui5_cl_ui5_view_builder.\n    IF mv_mode = `N`.\n      lo = page->ele( `VBox` ).\n    ELSE.\n      lo = page->ele( `HBox` ).\n    ENDIF.\n    lo->tag( `Text` ).');
    const p2 = prepareAbap(same);
    assert(p2.helperTokens === 0 && /<HBox><Text\/><\/HBox>/.test(p2.docs[0]), 'two arms at the same place keep the last one, as before');
  });
}
