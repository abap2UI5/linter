import { defineRule } from '../rule.mjs';
import { displayFlow } from '../lifecycle-rules.mjs';
import { branchTail } from '../abap-source.mjs';
import { parenRegion } from '../abap.mjs';
import { FROZEN_OBJECTS } from '../released-api.mjs';

/* A message queued in front of a navigation in the same statement sequence.
 * nav_app_leave( ) and nav_app_call( ) build the response from the TARGET
 * app, and z2ui5_cl_ui5_action=>prepare_app_stack( ) drops everything the
 * leaving app queued in this roundtrip - the "Saved." toast of a detail page
 * that returns to its list never shows, and nothing logs it. abap2UI5
 * cefce923 (2026-11-24, DEV) added `keep_messages = abap_true` to both calls;
 * the default stays the old behaviour.
 *
 * The scope is display-after-nav-app-call's: `branchTail( )` from the
 * message's statement end - the statements that run whenever the message
 * runs, nested blocks blanked, up to the first RETURN / ELSE / WHEN / ENDIF.
 * A message and a navigation in different arms, or the navigation inside a
 * nested block, are not judged. Only the spelled-out client calls are read on
 * both sides: a helper method that toasts or navigates may do so in a branch
 * of its own, which this sequence does not show.
 *
 * Not reported: a navigation that names keep_messages at all (abap_true or a
 * variable - the author decided), a message queued after the navigation,
 * and a nav_app_call( ) to a popup app - the caller's screen stays, so the
 * message is shown. A popup app is one of abap2UI5's own z2ui5_cl_pop_*
 * classes (src/99/02, released-api.mjs) or a class of the run's index that
 * displays a popup and never a view of its own; a target this source does
 * not name (a variable, NEW #( )) is reported, the parameter is harmless. */
const MESSAGE = /\b(?:me->)?\w*client\s*->\s*(message_toast_display|message_box_display|follow_up_action)\s*\(/gi;
const NAV = /\b(?:me->)?\w*client\s*->\s*(nav_app_leave|nav_app_call)\s*\(/i;
const TARGET = /^\s*(?:app\s*=\s*)?(?:NEW\s+([\w/]+)\s*\(|([\w/]+)\s*=>\s*\w+\s*\()/i;

/* A follow_up_action( ) counts when it is a CONTROL_GLOBAL call on the
 * MESSAGE_TOAST or MESSAGE_BOX global - the first literal of its arguments,
 * read on `src`, where literals keep their text. */
const queuesMessage = (src, open) => {
  const { body } = parenRegion(src, open);
  if (!/cs_event\s*-\s*control_global\b/i.test(body)) return false;
  const first = /[`']([^`']*)[`']/.exec(body);
  return Boolean(first && (first[1] === 'MESSAGE_TOAST' || first[1] === 'MESSAGE_BOX'));
};

const popupApp = (name, classIndex) => {
  if (FROZEN_OBJECTS[name]?.area === 'src/99/02') return true;
  const facts = classIndex?.get(name);
  return Boolean(facts?.app && facts.popupApp);
};

function check({ src, code, classIndex = null, abap2ui5 = null, report }) {
  const { afterStatement } = displayFlow(code);
  for (const m of code.matchAll(MESSAGE)) {
    const member = m[1].toLowerCase();
    const open = m.index + m[0].length - 1;
    if (member === 'follow_up_action' && !queuesMessage(src, open)) continue;
    const from = afterStatement(m.index);
    if (from === -1) continue;
    const tail = branchTail(code, from);
    const nav = NAV.exec(tail.text);
    if (!nav) continue;
    const navOpen = from + nav.index + nav[0].length - 1;
    const { body, end } = parenRegion(code, navOpen);
    if (end === undefined || code[end] !== ')') continue;
    if (/\bkeep_messages\s*=/i.test(body)) continue;
    const method = nav[1].toLowerCase();
    if (method === 'nav_app_call') {
      const t = TARGET.exec(body);
      const name = t ? (t[1] || t[2]).toLowerCase() : null;
      if (name && name !== '#' && popupApp(name, classIndex)) continue;
    }
    /* No fix: keep_messages is on abap2UI5's DEV branch only (cefce923),
     * not on main and in no release - written into a class, it would not
     * activate on any installation the linter judges against (main's
     * manifest). The fix (insert `keep_messages = abap_true`, with `app = ` in
     * front of a single positional argument) comes back with main. */
    report({
      member,
      value: method,
      offset: m.index,
      dedupe: String(m.index),
      ...(abap2ui5 ? { installed: abap2ui5 } : {}),
    });
  }
}

export default defineRule({
  id: 'message-before-navigation',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `${f.member}( ) queues a message, and ${f.value}( ) later in the same flow drops it with this app's screen — the user never sees it. Pass keep_messages = abap_true to the navigation once abap2UI5 has it (on its DEV branch, in no release yet${f.installed ? ` - not in ${f.installed}` : ''}), or show the message from the target app`,
  check,
});
