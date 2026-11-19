/*
 * A component that hands its view over as a string - `result =
 * view->stringify( )` in a method of its own, the view filled by `render(
 * node )`, which a caller can also point at a node of its own view
 * (abap2UI5-addons/abap-cloud-gui's selection screen, linter 0.10/0.11).
 * The statement was read as a handle capture (`result` = the view's handle),
 * so no document came out, and the render gate reported "no view
 * reconstructed from builder calls" on it. It hands the document over now,
 * like `client->view_display( view->stringify( ) )` does.
 *
 * Fixture: test/fixtures/componentview.clas.abap. See test/review/README.md.
 */
import fs from 'node:fs';

export default async function ({ section, assert, f, tempDir, checkFiles, prepareAbap }) {
  const component = (render) => `CLASS zcl_fx_part DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n    METHODS render\n      IMPORTING\n        node TYPE REF TO z2ui5_cl_ui5_view_builder.\n    METHODS stringify\n      RETURNING\n        VALUE(result) TYPE string.\nENDCLASS.\n\nCLASS zcl_fx_part IMPLEMENTATION.\n  METHOD render.\n${render}\n  ENDMETHOD.\n  METHOD stringify.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory(\n        )->ele( n = \`View\` ns = \`mvc\`\n            )->a( n = \`xmlns\`     v = \`sap.m\`\n            )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\` ).\n    DATA(page) = view->ele( \`Page\` ).\n    render( page ).\n    result = view->stringify( ).\n  ENDMETHOD.\nENDCLASS.\n`;

  section('reconstruct: result = view->stringify( ) hands the document over', () => {
    const prep = prepareAbap(component('    node->tag( `Text` )->a( n = `text` v = `x` ).'));
    assert(prep.docs.length === 1 && prep.helperTokens === 0, `one document, nothing unplaced (got ${prep.docs.length}, ${prep.helperTokens})`);
    assert(/<Page><Text text="x"\/><\/Page>/.test(prep.docs[0]), 'with what render( ) builds into the page');
    const chained = component('    node->tag( `Text` ).').replace('result = view->stringify( ).', 'DATA(xml) = view->stringify( ).\n    result = xml.');
    assert(prepareAbap(chained).docs.length === 1, 'into an inline declaration too');
  });

  section.browser('render-error: a component that renders into a node it is handed is rendered or not judged, never "no view reconstructed"', async () => {
    const opts = { render: true, properties: true };
    const [plain] = await checkFiles([f('componentview.clas.abap')], opts);
    assert(!plain.renderErrors.some((e) => /no view reconstructed/.test(e)), `no "no view reconstructed" (got ${plain.renderErrors.join(' | ')})`);
    assert(plain.skippedRender === true && plain.renderErrors.length === 0, 'the handle the branch leaves ambiguous skips the render');
    const file = `${tempDir('component-views')}/zcl_fx_part.clas.abap`;
    fs.writeFileSync(file, component('    node->tag( `Text` )->a( n = `text` v = `x` ).'));
    const [simple] = await checkFiles([file], opts);
    assert(!simple.skippedRender && simple.renderErrors.length === 0 && simple.docs.length === 1, `the simple component renders clean (got ${simple.renderErrors.join(' | ')})`);
    fs.writeFileSync(file, component('    node->tag( `Text` )->a( n = `text` v = `x` )->a( n = `wrapping` v = `maybe` ).'));
    const [broken] = await checkFiles([file], opts);
    assert(broken.renderErrors.length > 0, 'and a real render error in it is still reported');
  });
}
