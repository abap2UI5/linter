/*
 * Review round 2026-10-22 - two rules that read the ABAP text and were
 * fooled by it: `unescaped-text-in-attribute` judging a template by its
 * shape instead of by what it interpolates, and the chain-layout family
 * counting builder verbs spelled inside a literal as chain tokens. See
 * test/review/README.md for the harness.
 */
import { applyFixes } from '../../lib/fix.mjs';

/* A complete app class around a view - `defs` in the PUBLIC SECTION,
 * `chain` after the view's Button. */
const frame = ({ defs = '', chain = '' } = {}) =>
  'CLASS zcl_review_round1022 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
  + defs + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_review_round1022 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`     v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + '        )->ele( `Page`\n'
  + '          )->a( n = `id` v = `mainPage`\n'
  + '          )->tag( `Button`\n'
  + '            )->a( n = `text` v = client->_bind( mv_text )\n'
  + chain
  + '        )->end( ).\n\n'
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\n'
  + 'ENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, properties: true, minUi5: '1.120' };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const fixed = (src) => applyFixes(src, judge(src)).output;

  // ------------------------------------------------ 1. unescaped-text-in-attribute

  section('unescaped-text-in-attribute: a template is judged by what it interpolates, not by its shape', () => {
    /* A CONSTANTS holding a binding, interpolated into a template: the
     * reconstruction renders `{/NAME}: 5` - a binding - and the rule
     * reported the very same attribute as "carries data". Its fix moved the
     * value to `t`, after which escape_literal( ) turned the binding into
     * the text `\{/NAME\}: 5`. */
    const binding = frame({
      defs: '    CONSTANTS gc_label TYPE string VALUE `{/NAME}`.\n',
      chain: '          )->tag( `Text`\n            )->a( n = `text` v = |{ gc_label }: 5|\n',
    });
    assert(of(binding, 'unescaped-text-in-attribute').length === 0,
      'a constant holding a binding makes the template a binding - no finding');
    assert(/v = \|\{ gc_label \}: 5\|/.test(fixed(binding)), 'and nothing is moved to t');

    // a constant holding plain text is a literal with a name, as anywhere else
    const plain = frame({
      defs: '    CONSTANTS gc_label TYPE string VALUE `Total`.\n',
      chain: '          )->tag( `Text`\n            )->a( n = `text` v = |{ gc_label }: 5|\n',
    });
    assert(of(plain, 'unescaped-text-in-attribute').length === 0, 'a constant holding text needs no escaping');

    // a structured constant counts by its component's declaration too
    const structured = frame({
      defs: '    CONSTANTS: BEGIN OF c_s, label TYPE string VALUE `{/X}`, END OF c_s.\n',
      chain: '          )->tag( `Text`\n            )->a( n = `text` v = |{ c_s-label }|\n',
    });
    assert(of(structured, 'unescaped-text-in-attribute').length === 0, 'a structured constant holding a binding stays on v');

    // a literal piece is text that needs no escaping either
    const literal = frame({ chain: '          )->tag( `Text`\n            )->a( n = `text` v = |{ \'a\' }: 5|\n' });
    assert(of(literal, 'unescaped-text-in-attribute').length === 0, 'a literal interpolated is still a literal');

    // the control: a variable is data, exactly as before
    const variable = frame({
      defs: '    DATA mv_search TYPE string.\n',
      chain: '          )->tag( `Text`\n            )->a( n = `text` v = |Hits for { mv_search }|\n',
    });
    const found = of(variable, 'unescaped-text-in-attribute');
    assert(found.length === 1 && found[0].fixes?.[0]?.text === 't', 'a template interpolating a variable is data, with the v-to-t fix');
    // ... and a variable assigned binding vocabulary keeps the template on v
    const bound = frame({
      defs: '    DATA mv_path TYPE string.\n',
      chain: '          )->tag( `Text`\n            )->a( n = `text` v = |{ mv_path }|\n',
    }).replace('    DATA(view)', '    mv_path = client->_bind( mv_text ).\n    DATA(view)');
    assert(of(bound, 'unescaped-text-in-attribute').length === 0, 'a name whose write carries binding vocabulary keeps the template on v');
    // a call is data, as the value's origin is not one name the class writes
    const call = frame({ chain: '          )->tag( `Text`\n            )->a( n = `text` v = |{ lines( mt_rows ) } rows|\n' });
    assert(of(call, 'unescaped-text-in-attribute').length === 1, 'an expression interpolated is data, as before');
  });

  // ------------------------------------------------ 2. chain layout

  section('chain-indentation / chain-element-per-line: a builder verb inside a literal is not a chain token', () => {
    /* `)->ele(` in a template literal opened a phantom element, so every
     * attribute of the next control was reported against the wrong column -
     * and a help text quoting the builder would have had the same effect. */
    const quoted = frame({
      chain: '            )->a( n = `tooltip` v = |{ \'a\' } )->ele( |\n'
        + '          )->tag( `Input`\n'
        + '            )->a( n = `value` v = client->_bind( mv_text )\n'
        + '            )->a( n = `placeholder` v = `text with )->tag( in it`\n'
        + '          )->tag( `Button`\n'
        + '            )->a( n = `text` v = `Go`\n',
    });
    const found = judge(quoted).filter((x) => x.type.startsWith('chain-'));
    assert(found.length === 0, `no layout finding for a correct chain quoting a verb (${found.map((x) => x.type).join(', ') || 'none'})`);
    // the control: the same chain with a real outdented attribute is still reported
    const outdented = quoted.replace('            )->a( n = `text` v = `Go`\n', '        )->a( n = `text` v = `Go`\n');
    assert(judge(outdented).some((x) => x.type === 'chain-indentation'), 'a real deviation in the same chain is still reported');
  });
}
