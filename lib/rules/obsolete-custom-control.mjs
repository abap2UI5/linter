import { defineRule } from '../rule.mjs';
import { CC_NAMESPACE, OBSOLETE_CC_CONTROLS, OBSOLETE_CC_HELPERS } from '../cc-controls.mjs';
import { blankLiterals } from '../abap.mjs';

/* Two places say the same thing about a companion control abap2UI5 marks
 * OBSOLETE. Run for every class (scope 'class', and for a class on the
 * frozen builder by obsoleteCcHelperFindings( )): the old builder's helper
 * calls, read off the scrubbed source `src`. And by the property walk for
 * every tag (`node`, with the namespace its prefix is bound to as `lib`):
 * the control written as a tag. */
function check({ src, node, lib, localName, report }) {
  if (node) {
    /* One thing is said about a companion control whatever the walk does
     * with it next: abap2UI5 marks eight of them `// OBSOLETE:` (Timer,
     * Focus, Scrolling, Title, LPTitle, Favicon, Info, History), each
     * replaced by a frontend action or a client method. Judged by the
     * namespace the prefix is BOUND to, never by the prefix - so
     * `<cc:Timer xmlns:cc="z2ui5.cc">` is one and `<core:Title>` or an
     * sap.m Title is not - and by the exact local name, since an XML tag is
     * case-sensitive and `title` is an aggregation. */
    if (lib === CC_NAMESPACE && Object.hasOwn(OBSOLETE_CC_CONTROLS, localName(node))) {
      const name = localName(node);
      report({
        control: `${CC_NAMESPACE}.${name}`, value: name,
        replacement: OBSOLETE_CC_CONTROLS[name].replacement, offset: node.offset,
      });
    }
    return;
  }
  /*
   * The obsolete companion controls, in the spelling the view walk never sees:
   * the frozen builder's per-control helpers on `z2ui5_cl_xml_view_cc`, reached
   * through `z2ui5_cl_xml_view->_z2ui5( )`. The builder tag (`tag( n = \`Timer\`
   * ns = \`z2ui5\` )`) and the XML form (`<z2ui5:Timer>`) are judged on the
   * reconstructed document in properties.mjs; a class on z2ui5_cl_xml_view
   * reconstructs NO document, so this text scan is the only thing that can see
   * its Timer.
   *
   * Reading the old API at all is the exception frozen-view-builder's header
   * warns about ("confident noise"), and it is made on purpose: the question is
   * not what the view looks like but whether one of eight method NAMES is
   * called on the one receiver that has them - `_z2ui5( )`, or a handle
   * assigned from it. `->title( )` on the view itself is sap.m.Title and is not
   * touched. Over the scrubbed source with literal content blanked, so a name
   * in a comment or a string is prose, not a call.
   *
   * Every call site is a finding of its own - a rewrite of its own, the same
   * granularity the view half has, where each tag is a finding - so each
   * carries its offset as `dedupe`: the collector would otherwise fold two
   * calls of one helper into one finding.
   */
  const code = blankLiterals(src);
  if (!/\b_z2ui5\s*\(/i.test(code)) return;
  /* `DATA(cc) = view->_z2ui5( ).` / `cc = view->_z2ui5( ).` then
   * `cc->timer( … )` - the handle form, one statement away */
  const handles = new Set();
  for (const m of code.matchAll(/(?:\bDATA\s*\(\s*(\w+)\s*\)|\b(\w+))\s*=\s*[\w>~-]*?\b_z2ui5\s*\(\s*\)\s*\./gi)) {
    handles.add((m[1] || m[2]).toLowerCase());
  }
  const receivers = ['\\b_z2ui5\\s*\\(\\s*\\)', ...[...handles].map((h) => `\\b${h}`)].join('|');
  const helpers = Object.keys(OBSOLETE_CC_HELPERS).join('|');
  const re = new RegExp(`(?:${receivers})\\s*->\\s*(${helpers})\\s*\\(`, 'gid');
  for (const m of code.matchAll(re)) {
    const helper = m[1].toLowerCase();
    const name = OBSOLETE_CC_HELPERS[helper];
    report({
      control: `${CC_NAMESPACE}.${name}`, value: name, member: helper,
      replacement: OBSOLETE_CC_CONTROLS[name].replacement, offset: m.indices[1][0],
      dedupe: String(m.indices[1][0]),
    });
  }
}

export default defineRule({
  id: 'obsolete-custom-control',
  severity: 'error',
  category: 'lifecycle',
  scope: 'class',
  summary: 'an abap2UI5 custom control marked OBSOLETE upstream (`z2ui5:Timer`, `Focus`, `Scrolling`, `Title`, `LPTitle`, `Favicon`, `Info`, `History`)',
  detail: 'abap2UI5 ships a set of companion controls under the `z2ui5.cc` namespace, and eight of them carry an `// OBSOLETE: replaced by …` header in their own source: each did one job that the framework now does for the app through a released API, and they stay in the frontend only so existing apps keep running — they are on the removal plan, and they must not be used. The replacements, in the names `z2ui5_if_client` releases them under: `Timer` → `client->follow_up_action( )` with `val = client->cs_event-start_timer` and the event and the delay in `t_arg`; `Focus` → `cs_event-set_focus`; `Scrolling` → `cs_event-scroll_to` / `cs_event-scroll_into_view`; `Title` → `cs_event-set_title`; `LPTitle` → `cs_event-set_title_launchpad`; `Favicon` → `cs_event-set_favicon`; `Info` → `client->get( )-s_device` / `client->get( )-s_ui5`; `History` → `client->hash_set( )` / `client->app_state_set_active( )`. The finding names the one that applies. Three spellings are read: a builder tag (`tag( )` naming `Timer` with `ns` set to the `z2ui5` prefix), an XML view or fragment (`<z2ui5:Timer …/>`) — in both, judged by the namespace the prefix is **bound** to, so `<cc:Timer xmlns:cc="z2ui5.cc">` is reported and a `sap.m.Title` or a `core:Title` never is — and the frozen builder\'s helpers (`view->_z2ui5( )->timer( )`, `->focus( )`, `->scrolling( )`, `->title( )`, `->lp_title( )`, `->favicon( )`, `->info_frontend( )`, `->history( )`), which are read even on a class `frozen-view-builder` otherwise leaves unjudged. The other companion controls (`Storage`, `MessageManager`, `MultiInputExt`, `Dirty`, `Geolocation`, `CameraPicture`, …) are not obsolete and are not reported. An error by project decision, not because the view breaks today: the render gate still creates it. No `--fix`: a control that sits in the view becomes a call in the class, usually in another method and on another roundtrip, which is a rewrite rather than a mechanical edit.',
  example: `view->tag( n = \`Timer\` ns = \`z2ui5\`   " xmlns:z2ui5="z2ui5.cc"
    )->a( n = \`delayMS\`  v = \`2000\`
    )->a( n = \`finished\` v = client->_event( \`TICK\` ) )`,
  remedy: `client->follow_up_action( val   = client->cs_event-start_timer
                          t_arg = VALUE #( ( \`TICK\` ) ( \`2000\` ) ) )`,
  message: (f) => {
    const use = f.replacement ?? OBSOLETE_CC_CONTROLS[f.value]?.replacement;
    const gone = OBSOLETE_CC_CONTROLS[f.value]?.removedAfter;
    const what = gone
      ? `an obsolete abap2UI5 custom control, removed after ${gone} (a later release fails to load the view)`
      : 'an obsolete abap2UI5 custom control (kept only so existing apps keep running)';
    return (f.member
      ? `_z2ui5( )->${f.member}( ) writes ${f.control}, ${what}`
      : `${f.control} is ${what}`) + ' — do not use it' + (use ? `; use ${use} instead` : '');
  },
  check,
});
