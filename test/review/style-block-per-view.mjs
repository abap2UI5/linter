/*
 * style-block-per-view - a large <style> block in a view the class displays
 * from an event branch.
 *
 * abap2UI5's backlog (2026-11-24): a downstream app repository rendered a
 * palette of about 9 KB of CSS through core:HTML into every view its apps
 * display, so it travelled with every view_display( ). The installation's
 * exit (z2ui5_if_ui5_exit=>ty_s_http_config-styles_css) writes it once per
 * page load. Positive shapes, and every "must not report" of the item: a
 * small block, a view displayed only on init, a block built from data.
 */

/* `rules` CSS rules as a `&&` chain of backtick literals - about 60 bytes
 * each, so 40 is well over the 2048-byte threshold and 10 well under it. */
const sheet = (rules, { data = null, template = false } = {}) => {
  const lines = [];
  for (let i = 0; i < rules; i++) {
    lines.push(template
      ? `|.zPalette${i} \\{ color: #123456; background: #abcdef; margin: 0; \\}|`
      : `\`.zPalette${i} \\{ color: #123456; background: #abcdef; margin: 0; \\}\``);
  }
  if (data) lines.splice(1, 0, data);
  return `\`<style>\` &&\n      ${lines.join(' &&\n      ')} &&\n      \`</style>\``;
};

const app = ({ main, render = 'render', css = sheet(40), extra = '', decl = '' }) => `CLASS zcl_styled DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA client TYPE REF TO z2ui5_if_client.
    DATA mv_color TYPE string.
${decl}  PROTECTED SECTION.
    METHODS ${render}.
ENDCLASS.

CLASS zcl_styled IMPLEMENTATION.

  METHOD z2ui5_if_app~main.
    me->client = client.
${main}
  ENDMETHOD.

  METHOD ${render}.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`Page\`
        )->ele( n = \`HTML\` ns = \`core\`
            )->a( n = \`content\` v = ${css} ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
${extra}
ENDCLASS.
`;

const EVENT_MAIN = `    IF client->check_on_init( ).
      render( ).
    ENDIF.
    CASE client->get_event( ).
      WHEN \`REFRESH\`.
        render( ).
    ENDCASE.`;

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, properties: true, minUi5: '1.71' };
  const of = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'style-block-per-view');

  section('style-block-per-view: a 2 KB+ sheet displayed from an event branch is a hint', () => {
    const hit = of(app({ main: EVENT_MAIN }));
    assert(hit.length === 1, `reported once (${hit.length})`);
    assert(hit[0].severity === 'hint' || hit[0].severity === undefined, `a hint (${hit[0]?.severity})`);
    assert(hit[0].count > 2048 && /bytes of CSS/.test(hit[0].message), `the message names the size (${hit[0]?.count})`);
    assert(hit[0].member === 'render', 'the method holding the sheet is the member');
  });

  section('style-block-per-view: every display path that is no lifecycle arm counts', () => {
    // unconditional: displayed on every roundtrip
    assert(of(app({ main: '    render( ).' })).length === 1, 'an unconditional display');
    // check_on_event( ) arm, and the ELSE of a lifecycle fork
    assert(of(app({ main: '    IF client->check_on_navigated( ).\n    ELSEIF client->check_on_event( `GO` ).\n      me->render( ).\n    ENDIF.' })).length === 1, 'a check_on_event( ) arm');
    assert(of(app({ main: '    IF client->check_on_init( ).\n    ELSE.\n      render( ).\n    ENDIF.' })).length === 1, 'the ELSE of a lifecycle fork');
    // through a dispatcher method of the class
    const viaHelper = app({
      main: '    IF client->check_on_init( ).\n      render( ).\n      RETURN.\n    ENDIF.\n    on_event( ).',
      decl: '    METHODS on_event.\n',
      extra: '\n  METHOD on_event.\n    CASE client->get_event( ).\n      WHEN `SAVE`.\n        render( ).\n    ENDCASE.\n  ENDMETHOD.\n',
    });
    assert(of(viaHelper).length === 1, 'through on_event( ), called after the init branch');
    // a template with escaped braces only is static text too
    assert(of(app({ main: EVENT_MAIN, css: sheet(40, { template: true }) })).length === 1, 'a |…| sheet without an embedded expression');
  });

  section('style-block-per-view: a sheet held in a constant is judged where it is read', () => {
    const src = app({
      main: EVENT_MAIN,
      css: 'lc_css',
      decl: `    CONSTANTS lc_css TYPE string VALUE ${sheet(40).replace(/ &&\n\s*/g, ' && ')}.\n`,
    });
    // a constant with && is not ABAP a release before 7.40 accepts; the
    // shape is what matters: the read site is the display path
    assert(of(src).length === 1, `reported through the reading method (${of(src).length})`);
  });

  section('style-block-per-view: what it must not report', () => {
    assert(of(app({ main: EVENT_MAIN, css: sheet(10) })).length === 0, 'a small block (under 2048 bytes)');
    assert(of(app({ main: '    IF client->check_on_init( ).\n      render( ).\n    ENDIF.' })).length === 0, 'a view displayed only on init');
    assert(of(app({ main: '    IF client->check_on_navigated( ).\n      render( ).\n    ENDIF.\n    CASE client->get_event( ).\n      WHEN `X`.\n        client->message_toast_display( `x` ).\n    ENDCASE.' })).length === 0,
      'a view displayed only on navigation, the events only toast');
    assert(of(app({ main: EVENT_MAIN, css: sheet(40, { data: 'mv_color' }) })).length === 0, 'a block with a variable concatenated in (built from data)');
    assert(of(app({ main: EVENT_MAIN, css: sheet(40, { data: '|.zUser \\{ color: { mv_color }; \\}|' }) })).length === 0, 'a block with an embedded expression (built from data)');
    assert(of(app({ main: '    IF mv_color IS INITIAL.\n      render( ).\n    ENDIF.' })).length === 0, 'a display under some other condition is not judged');
    assert(of(app({ main: '    client->message_toast_display( `x` ).' })).length === 0, 'a render method nothing calls');
  });
}
