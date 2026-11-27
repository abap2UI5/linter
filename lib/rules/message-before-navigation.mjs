import { defineRule } from '../rule.mjs';
import { displayFlow } from '../lifecycle-rules.mjs';
import { branchTail } from '../abap-source.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';
import { isMovedPopup } from '../released-api.mjs';
import { ABAP2UI5_SINCE } from '../abap2ui5-since.mjs';

/* A message queued in front of a navigation in the same statement sequence.
 * nav_app_leave( ) and nav_app_call( ) build the response from the TARGET
 * app, and z2ui5_cl_ui5_action=>prepare_app_stack( ) drops everything the
 * leaving app queued in this roundtrip - the "Saved." toast of a detail page
 * that returns to its list never shows, and nothing logs it. abap2UI5
 * 1.151.0 added `keep_messages = abap_true` to both calls (cefce923); the
 * default stays the old behaviour. When it came is read from
 * data/abap2ui5-since.json (`clientParameters`), not written here.
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

/* `a` is an older release than `b` - both `1.151.0`-shaped, or `b` is
 * `main` / `DEV` (in no release, so every release is older) */
const older = (a, b) => {
  if (b === 'main' || b === 'DEV') return true;
  const x = a.split('.').map(Number); const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

/* The fix: the navigation's whole argument list `( … )` rewritten with
 * `keep_messages = abap_true` appended - one replacement rather than an
 * insertion, so two messages in front of the same navigation do not insert
 * it twice (the second edit overlaps the first and the next pass finds the
 * parameter). A single positional argument is the PREFERRED PARAMETER app
 * (nav_app_leave( )) or the one mandatory app (nav_app_call( )), and ABAP
 * wants every argument named once one is: it gets `app = `. On a line of
 * its own, the parameter goes on a line of its own under the last argument.
 * A comment inside the parentheses (`src`, scrubbed, differs from `source`
 * there) gets no fix - appending behind it would land in the comment. */
const keepMessagesFix = (source, src, open, close) => {
  if (source.slice(open, close + 1) !== src.slice(open, close + 1)) return null;
  const body = source.slice(open + 1, close);
  const param = 'keep_messages = abap_true';
  if (!body.trim()) return { start: open, end: close + 1, text: `( ${param} )` };
  const lead = body.length - body.trimStart().length;
  const tail = body.trimEnd().length;
  const marks = namedArgMarks(body);
  const positional = !marks.length && !/^\s*EXPORTING\b/i.test(body);
  const argAt = positional ? lead : marks[marks.length - 1].nameStart;
  const line = body.lastIndexOf('\n', argAt - 1);
  const indent = body.slice(line + 1, argAt);
  const sep = line !== -1 && !indent.trim() ? `\n${indent}` : ' ';
  const text = `(${body.slice(0, lead)}${positional ? 'app = ' : ''}${body.slice(lead, tail)}${sep}${param}${body.slice(tail)})`;
  return { start: open, end: close + 1, text };
};

const popupApp = (name, classIndex) => {
  if (isMovedPopup(name)) return true;
  const facts = classIndex?.get(name);
  return Boolean(facts?.app && facts.popupApp);
};

function check({ source = null, src, code, classIndex = null, abap2ui5 = null, report }) {
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
    /* The fix only where the parameter exists: without a release configured
     * the linter judges against abap2UI5's main, which has it; a configured
     * release older than the one that brought it keeps the finding without
     * one - written into the class, the parameter would not activate there. */
    const since = ABAP2UI5_SINCE.clientParameters?.[`${method}-keep_messages`] ?? 'main';
    const missing = Boolean(abap2ui5) && older(abap2ui5, since);
    const fix = missing ? null : keepMessagesFix(source ?? src, src, navOpen, end);
    report({
      member,
      value: method,
      offset: m.index,
      dedupe: String(m.index),
      since,
      ...(missing ? { installed: abap2ui5 } : {}),
      ...(fix ? { fixes: [fix] } : {}),
    });
  }
}

export default defineRule({
  id: 'message-before-navigation',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  fixable: true,
  message: (f) => {
    const head = `${f.member}( ) queues a message, and ${f.value}( ) later in the same flow drops it with this app's screen — the user never sees it.`;
    const came = f.since === 'main' || f.since === 'DEV' ? `is on abap2UI5's ${f.since} and in no release yet` : `came with abap2UI5 ${f.since}`;
    return f.installed
      ? `${head} keep_messages = abap_true on the navigation carries it, but it ${came} - not in ${f.installed}: update abap2UI5, or show the message from the target app`
      : `${head} Pass keep_messages = abap_true to the navigation (it ${came}), or show the message from the target app`;
  },
  check,
});
