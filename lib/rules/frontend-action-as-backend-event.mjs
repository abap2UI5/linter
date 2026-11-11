import { defineRule } from '../rule.mjs';
import { clientCalls, namedArgMarks, parenRegion } from '../abap.mjs';
import { CS_EVENT, factsOf, inheritsCsEvent } from '../guide-rules.mjs';

function check({ src, code, classIndex = null, report }) {
  /* A class may declare a `cs_event` of its OWN - `CONSTANTS: BEGIN OF
   * cs_event, search TYPE string VALUE \`SEARCH\`, …` is a common way to
   * name an app's backend events (samples app 000, rap-ext). Then the bare
   * `cs_event-x` and `me->cs_event-x` are that constant, a backend event
   * name like any literal, and only a spelling through a client reference
   * (`client->`, `mo_client->`, `z2ui5_if_client=>`) is the frontend action
   * - the rename to follow_up_action( ) broke every wire of such a class.
   * The same holds for a `cs_event` INHERITED from a superclass (rap-ext's
   * worklist inherits the list report's), resolved through `classIndex`
   * when the superclass is among the linted files; a superclass the index
   * does not know might declare one, and a false wire is worse than a
   * missed one there, so such a class is read as owning it. */
  const own = factsOf(src);
  const inherited = inheritsCsEvent(own?.superclass, classIndex);
  const ownsCsEvent = own?.csEvent || inherited !== false;
  const clientConstant = (value) => {
    const prefix = value.slice(0, value.search(/cs_event-/i)).toLowerCase();
    /* `<class>=>cs_event-x` is that class's constant: the client's only
     * when the class is the client interface itself. */
    const qualifier = prefix.match(/([\w/]+)=>$/)?.[1];
    if (qualifier) return qualifier === 'z2ui5_if_client';
    return !ownsCsEvent || !['', 'me->'].includes(prefix);
  };
  /* A frontend action raised as a BACKEND event. `cs_event-popup_close` and
   * its siblings name actions the frontend handles on its own (the popup slot
   * is torn down without a roundtrip); `_event( )` is the backend wire, so a
   * constant passed to it is a backend event named POPUP_CLOSE like any
   * other: it reaches main( ), falls through every CASE and closes nothing.
   * The guide (§6): "Not `_event( cs_event-popup_close )`: that is a backend
   * event named `POPUP_CLOSE` like any other, it reaches `main( )` and closes
   * nothing by itself." `event-without-handler` cannot see it - the name is
   * not a literal - so this is the one rule that sees the dead wire. The fix
   * is the rename to follow_up_action( ), whose first parameter is the same
   * `val`; a positional argument is given its name on the way, the way the
   * guide writes the call. */
  // `/\w*client\s*->\s*(_event)\s*\(/gi`, read word by word (lib/abap.mjs)
  for (const m of clientCalls(code, (method) => method === '_event')) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const marks = namedArgMarks(body);
    const val = marks.length ? marks.find((a) => a.name === 'val') : null;
    const value = marks.length ? val?.value : body.trim();
    const token = value?.match(CS_EVENT);
    if (!token || !clientConstant(value)) continue;
    const at = m.index + m[0].indexOf(m[1]);
    const fixes = [{ start: at, end: at + m[1].length, text: 'follow_up_action' }];
    if (!marks.length) {
      const lead = body.length - body.trimStart().length;
      fixes.push({ start: open + 1 + lead, end: open + 1 + lead, text: 'val = ' });
    }
    report({
      member: token[1].toUpperCase(),
      value: value, offset: m.index, fixes,
    });
  }
}

export default defineRule({
  id: 'frontend-action-as-backend-event',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a `cs_event-` constant raised through `client->_event( )`',
  detail: 'The `cs_event-` constants name FRONTEND actions — `popup_close` tears the popup slot down in the browser, without a roundtrip — and `follow_up_action( )` is the wire that sends one. `_event( )` is the BACKEND wire: whatever it is given becomes the event name of a roundtrip. So a constant passed to it is, in the guide\'s words (§6), "a backend event named `POPUP_CLOSE` like any other, it reaches `main( )` and closes nothing by itself" — the roundtrip runs, falls through every `WHEN`, and the dialog stays. Nothing else can see it: `event-without-handler` judges literal names only, and this one is a constant. Any spelling of the constant is reported (`client->cs_event-…`, `z2ui5_if_client=>cs_event-…`, with or without `val =`) — except a `cs_event` of the class\'s own: where the class declares one, or inherits one from a superclass (resolved through the other linted files; a superclass the run does not have is read as declaring one), the bare `cs_event-…` and `me->cs_event-…` are that constant, a backend event name, and only a spelling through a client reference is judged. A class-qualified `<class>=>cs_event-…` is that class\'s constant and reported only when the class is `z2ui5_if_client`; a literal `_event( \\`POPUP_CLOSE\\` )` is a backend event by declaration and is left to the handler rules.',
  example: ')->a( n = `press` v = client->_event( client->cs_event-popup_close ) )   " a roundtrip, and the popup stays',
  remedy: ')->a( n = `press` v = client->follow_up_action( val = client->cs_event-popup_close ) )',
  fixNote: 'The call is renamed to `client->follow_up_action( )`, whose first parameter is the same `val`; a positional constant is given its `val =` on the way. The argument itself is untouched.',
  message: (f) => `client->_event( cs_event-${f.member.toLowerCase()} ) raises a BACKEND event named ${f.member} — it reaches main( ) like any other and the frontend action it names never runs; wire the action with client->follow_up_action( val = … )`,
  check,
});
