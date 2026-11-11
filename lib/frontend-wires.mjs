/*
 * frontend-wires — every \`client->_event_client( )\` / \`follow_up_action( )\`
 * wire in one class: the frontend actions, their arguments and the control ids
 * they name.
 *
 * Its own module because it is its own subject. The frontend resolves each of
 * these against a CLOSED set mirrored in lib/frontend-actions.mjs and, on a
 * miss, mostly returns without even a log - which is what makes every rule of
 * this family a silent-failure rule. The rules are one file each
 * (lib/rules/, the readers they share in lib/wire-readers.mjs); what is left
 * here reads each wire - its action, its literal arguments - runs them in the
 * order their verdicts depend on, and collects what is judged per class after
 * the loop (the rebuild-survival candidates, the events the frontend raises).
 * raw-javascript-to-frontend is the one rule of the family the property walk
 * runs too (its other shapes are the view's).
 *
 * Called from checkAbapRules with that entry point's own \`report( )\`, so the
 * collapse-repeats rule and the order of the findings are unchanged by the
 * move - which is what \`npm test\` proves.
 */
import rawJavascriptToFrontend from './rules/raw-javascript-to-frontend.mjs';
import { runRule } from './rule.mjs';
import { staticIdOf } from './wire-readers.mjs';
import invalidAggregationItem from './rules/invalid-aggregation-item.mjs';
import literalViewSlot from './rules/literal-view-slot.mjs';
import unknownFrontendAction from './rules/unknown-frontend-action.mjs';
import unknownViewSlot from './rules/unknown-view-slot.mjs';
import frontendActionUnknownId from './rules/frontend-action-unknown-id.mjs';
import invalidActionPayload from './rules/invalid-action-payload.mjs';
import filterGroupsNotArrays from './rules/filter-groups-not-arrays.mjs';
import invalidFrontendAction from './rules/invalid-frontend-action.mjs';
import invalidKeyboardShortcut from './rules/invalid-keyboard-shortcut.mjs';
import settablePropertyViaAction from './rules/settable-property-via-action.mjs';
import deniedControlMethodRule from './rules/denied-control-method.mjs';
import frontendActionTooNew from './rules/frontend-action-too-new.mjs';
import controlCallArgCount from './rules/control-call-arg-count.mjs';
import controlCallArgKind from './rules/control-call-arg-kind.mjs';
import controlStateLostOnRebuild from './rules/control-state-lost-on-rebuild.mjs';
import navigationLostOnRebuild from './rules/navigation-lost-on-rebuild.mjs';
import { parenRegion } from './abap.mjs';
import { ACTION_ID_SLOTS, CONTROL_METHOD_ID_ARG } from './frontend-actions.mjs';
import { memberSection, propertyDecl } from './ui5-meta.mjs';
import { literalElements, bindableAnywhere, UNBINDABLE_TYPES } from './abap-source.mjs';

/* The navigation calls of NavContainer, SplitApp/SplitContainer and
 * FlexibleColumnLayout that move a container to a NAMED page - the ones a
 * rebuild undoes and a display path can re-issue. The stack-relative calls
 * (`back`, `backDetail`, `backMaster`, `navigateBack`) are out: the rebuild
 * empties the page stack they move along. */
const NAV_TO = new Set(['to', 'backToPage', 'toDetail', 'toMaster']);

/* Returns the backend event names it saw raised FROM the frontend
 * (KEYBOARD_SHORTCUT, START_TIMER, HASH_ATTACH_CHANGED, CROSS_APP_NAV_GET_LINKS), which the caller judges against the
 * class's own WHEN branches. */
export function checkFrontendWires({
  src, code, report, viewIds, data, controlIds, containerPages = null, minUi5 = '1.71', timings = null,
}) {
  /* Frontend actions: a wire the browser rejects at dispatch.
   *
   * `client->_event_client( )` and `client->follow_up_action( )` name an
   * action and hand it positional t_arg values. FrontendAction resolves the
   * global object, the method and the binding method against closed
   * whitelists, and a miss is a console log - no exception, no failed render,
   * nothing the property or render gate can see. The button simply does
   * nothing when pressed.
   *
   * Only closed sets are judged (see frontend-actions.mjs) and only literal
   * arguments; CONTROL_BY_ID's method list is open by design and is left
   * alone, except for the one shape that is unambiguously wrong: an empty
   * second element. That slot used to carry the view and is now inserted by
   * the runtime, so an empty one shifts the method out of its position and
   * the frontend logs "method '' not allowed". */
  /* The rules of this family are one file each (lib/rules/); this function
   * reads each wire - which action, which literal arguments - and runs them
   * in the order their verdicts depend on. A rule that returns true decided
   * the wire, and nothing after it is judged on that wire. */
  const run = (rule, context) => runRule(rule, { ...context, report }, { timings });

  /* Backend events raised from the FRONTEND: a KEYBOARD_SHORTCUT registration
   * dispatches its event name as eB(...) when the combo fires, START_TIMER
   * its callback when the timer expires, HASH_ATTACH_CHANGED its event on a
   * foreign hash change. A name no branch handles is the same
   * dead wire as an unhandled client->_event( ) — collected in the loop,
   * judged after it. */
  const frontendRaised = [];

  /* Candidate rebuild-survival wires, judged AFTER the loop: the verdict is
   * not a property of one wire but of the whole class — a setter issued from
   * an event handler is fine as long as SOME method on the display path
   * issues it too. */
  const stateWires = [];
  /* …and the NAVIGATION calls on a container, judged after the loop too (see
   * navigation-lost-on-rebuild below). */
  const navWires = [];

  /* WHERE a wire is comes out of the blanked copy - a class that documents its
   * own wire ("a frontend wire is client->follow_up_action( … )") writes no
   * wire - while WHAT it carries is read out of `src`, where the t_arg values
   * still have their text. The two are offset-for-offset the same source. */
  for (const call of (code ?? src).matchAll(/client->(_event_client|follow_up_action)\s*\(/gi)) {
    const open = src.indexOf('(', call.index + call[0].length - 1);
    const { body: callBody } = parenRegion(src, open);
    const base = open + 1;
    const token = callBody.match(/cs_event-(\w+)/i);
    let action = token ? token[1].toLowerCase() : null;
    if (!token) {
      /* No cs_event constant: the val is a string LITERAL or a runtime value
       * (the latter is not judged). A NAME-SHAPED literal (^[A-Za-z0-9_]+$)
       * is dispatched exactly like the constant — but the constant is
       * compile-checked and the literal is not, and the dispatch table
       * misses with NO log at all. Case-sensitive on purpose: the runtime
       * never upper-cases, so `set_title` misses at runtime too.
       *
       * Anything NOT name-shaped splits by POSITION, not by method name.
       * Queued as a statement, follow_up_action inserts the val VERBATIM as
       * custom_js — the raw-JavaScript escape hatch, which runs unchecked in
       * the browser and is reported as such: the frontend is a renderer,
       * logic that needs code belongs in ABAP or in a cs_event- action that
       * travels as data. Written where its RESULT is consumed (`v = client->…`,
       * the view-attribute form), it takes the `IF result IS SUPPLIED` path to
       * get_event_client instead, which has no custom_js at all — the same
       * path _event_client always takes. There a non-name literal can never
       * dispatch and is an unknown action, not code in flight. */
      // positional (`follow_up_action( \`X\` …)`) or named - and a named `val`
      // may follow `t_arg`, ABAP does not order arguments
      const lit = callBody.match(/(?:^\s*|\bval\s*=\s*)(?:`((?:[^`]|``)*)`|'((?:[^']|'')*)'|\|((?:[^|\\]|\\.)*)\|)/i);
      if (!lit) continue;
      const text = lit[1] ?? lit[2] ?? lit[3];
      if (!/^[A-Za-z0-9_]+$/.test(text)) {
        let before = call.index - 1;
        while (before >= 0 && /\s/.test(src[before])) before--;
        const consumed = before >= 0 && src[before] === '=';
        if (call[1].toLowerCase() === 'follow_up_action' && !consumed) {
          run(rawJavascriptToFrontend, { shape: 'custom-js', value: text, offset: base + lit.index });
        } else {
          run(unknownFrontendAction, { text, offset: base + lit.index, at: null });
        }
        continue;
      }
      // the literal's content ends one character before the match does
      const at = base + lit.index + lit[0].length - 1 - text.length;
      if (run(unknownFrontendAction, { text, offset: base + lit.index, at })) continue;
      action = text.toLowerCase();
    }

    const vm = callBody.match(/\bview\s*=\s*(([`'])([^`']*)\2)/i);
    if (vm) {
      const at = base + vm.index + vm[0].indexOf(vm[1]);
      if (!run(unknownViewSlot, { value: vm[3], offset: base + vm.index, at: at + 1 })) {
        run(literalViewSlot, { value: vm[3], start: at, end: at + vm[1].length });
      }
    }

    // `VALUE #( )` or the typed `VALUE string_table( )` - the same table
    const tm = callBody.match(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/i);
    const argOpen = tm ? callBody.indexOf('(', tm.index + tm[0].length - 1) : -1;
    const args = tm ? literalElements(parenRegion(callBody, argOpen).body, base + argOpen + 1) : [];

    if (action === 'control_by_id'
        && run(frontendActionUnknownId, { arg: args[0], control: 'CONTROL_BY_ID', member: 'id', viewIds })) continue;
    /* A CONTROL_BY_ID method whose own first argument is a control id too
     * (`to` targets, `openBy`/`toggleBy` anchors, `setSelectedSection`, …) —
     * the kinds CONTROL_METHODS declares as controlId/anchor. A miss resolves
     * nothing and logs. An EMPTY argument stays silent: for the OrNull kinds
     * it is the documented way to clear. */
    if (action === 'control_by_id' && CONTROL_METHOD_ID_ARG.includes(args[1]?.value)
        && run(frontendActionUnknownId, { arg: args[2], control: 'CONTROL_BY_ID', member: args[1].value, viewIds })) continue;

    run(invalidActionPayload, { action, args, data });
    run(filterGroupsNotArrays, { action, args });
    run(invalidFrontendAction, { action, args, data, shape: 'filter', src });

    if (action === 'keyboard_shortcut') {
      run(invalidKeyboardShortcut, { action, args });
      const scope = args[2];
      run(frontendActionUnknownId, { arg: scope, control: 'KEYBOARD_SHORTCUT', member: 'scope', viewIds, slots: true, whole: true });
      /* The scope may be a slot or a control id, so only an EXACT slot value
       * is judged here — that is the one spelling a constant can replace, and
       * a control id that merely upper-cases to one is left alone. */
      if (scope?.value) run(literalViewSlot, { value: scope.value, start: scope.litStart, end: scope.litEnd });
    }
    /* KEYBOARD_SHORTCUT's EVENT (t_arg@1) is a backend event like any
     * client->_event( ) one — collected for the handler check. */
    /* HASH_ATTACH_CHANGED names one too (t_arg@1): the backend event a
     * hash change the app did not write itself round-trips as (browser
     * Back/Forward, a manual edit) - its WHEN was reported as a handler
     * nothing raises (samples app 499, samples-controls 012 and 57x). */
    /* CROSS_APP_NAV_GET_LINKS names its answer (t_arg@2): the backend event
     * raised once the launchpad's getLinks has answered - its WHEN was
     * reported as a handler nothing raises (samples-stack app 026). */
    if (action === 'keyboard_shortcut' || action === 'start_timer' || action === 'hash_attach_changed'
        || action === 'cross_app_nav_get_links') {
      const ev = action === 'keyboard_shortcut' ? args[1] : action === 'cross_app_nav_get_links' ? args[2] : args[0];
      if (ev?.value && /^[A-Za-z0-9_]+$/.test(ev.value)) {
        frontendRaised.push({ name: ev.value.toUpperCase(), offset: ev.offset });
      }
    }

    /* SET_SIZE_LIMIT's view key — `(limit)(viewKey)` to set, `(viewKey)` to
     * reset. A key outside the five slots addresses no view's model and the
     * limit lands nowhere. A bare numeric single argument is left alone (it
     * reads as a limit, which is its own confusion, not this rule's). */
    if (action === 'set_size_limit' && args.length) {
      const slotArg = args.length > 1 ? args[1] : args[0];
      if (slotArg?.value && !/^\d+$/.test(slotArg.value)) {
        if (!run(unknownViewSlot, { value: slotArg.value, offset: slotArg.offset, at: null })) {
          run(literalViewSlot, { value: slotArg.value, start: slotArg.litStart, end: slotArg.litEnd });
        }
      } else if (slotArg?.value) {
        run(literalViewSlot, { value: slotArg.value, start: slotArg.litStart, end: slotArg.litEnd });
      }
    }

    /* The other id-addressed actions, same trust condition as CONTROL_BY_ID
     * (see ACTION_ID_SLOTS for who fails how quietly). */
    const idSlots = ACTION_ID_SLOTS[action];
    if (idSlots && viewIds) {
      let miss = false;
      for (const at of idSlots) {
        if (run(frontendActionUnknownId, { arg: args[at], control: action.toUpperCase(), member: 'id', viewIds, whole: true })) miss = true;
      }
      if (miss) continue;
    }

    run(settablePropertyViaAction, { action, args, controlIds, data });

    /* Candidates for control-state-lost-on-rebuild: a `set…( )` whose value
     * CANNOT be bound (the rule says which three shapes, and why the value
     * has to be non-literal). ORDER before the argument checks below: this is
     * about the wire's place in the class, not about its payload. */
    /* A navigation call on a container with a literal id: judged after the
     * loop by navigation-lost-on-rebuild, which needs no metadata - unlike
     * the setters below. */
    if (action === 'control_by_id' && NAV_TO.has(args[1]?.value) && staticIdOf(args[0]?.value) && args[2]) {
      navWires.push({ id: staticIdOf(args[0].value), call: args[1].value, target: args[2], offset: args[1].offset });
    }
    if (action === 'control_by_id' && data) {
      /* `^set…` is what keeps the NAVIGATION family out of this rule - `to`,
       * `backToPage`, `toDetail`, `toMaster` - and that is a side effect of the
       * matcher rather than a decision anybody wrote down. Read this before
       * widening it: those four lose their state to the same rebuild, but the
       * two tests below give the WRONG answer on them, so widening the matcher
       * alone would ship false positives rather than coverage.
       *
       *   - the non-literal-value test does not discriminate. samples-controls
       *     096 navigates `toDetail( get_event_arg( ) )` while keeping a
       *     two-way bound `mode`, and 242 navigates `to( get_event_arg( ) )`
       *     while keeping a bound `animation`. Both non-literal, both with a
       *     surviving bound field, both CORRECT - the fields name a
       *     SplitAppMode and a transition, not a page.
       *   - the re-issue key `id|setter` reports the remedy as the defect.
       *     App 585's handler navigates to `key` and its view_display( )
       *     re-issues `to` with `selected_key`: same container, different
       *     argument, so the keys do not match.
       *
       * The discriminator that family needs is a surviving bound field naming
       * a PAGE ID OF THAT CONTAINER, and the bindability arm does not transfer
       * at all (there is no `to` property to bind instead). That is a separate
       * rule, and it exists now: navigation-lost-on-rebuild, collected just
       * above and judged after the loop (abap2UI5's backlog item
       * `navcontainer-position-not-reissued`). */
      const stateSetter = String(args[1]?.value ?? '').match(/^set([A-Z]\w*)$/);
      const carried = args[2];
      if (stateSetter && carried && carried.value === null) {
        const prop = stateSetter[1][0].toLowerCase() + stateSetter[1].slice(1);
        const id = staticIdOf(args[0]?.value);
        const named = id && controlIds ? controlIds[id] : null;
        /* Only a control the SNAPSHOT knows is judged directly; a companion
         * control or one from a custom namespace takes the global answer. */
        const cls = named && data[named] ? named : null;
        const bindable = cls
          ? (memberSection(data, cls, prop) === 'properties'
             && !UNBINDABLE_TYPES.includes(propertyDecl(data, cls, prop)?.type ?? ''))
          : bindableAnywhere(data, prop);
        if (!bindable) {
          stateWires.push({
            id: id || null, control: cls, setter: args[1].value, offset: args[1].offset,
          });
        }
      }
    }

    if (run(deniedControlMethodRule, { action, args })) continue;
    if (run(invalidFrontendAction, { action, args, data, shape: 'view-slot', src })) continue;

    /* Every id-bearing argument may carry the aggregation-item form, so the
     * shape is judged wherever one is read: CONTROL_BY_ID's own target, the
     * methods whose first argument is an id too, and the id slots of the
     * other actions. */
    if (action === 'control_by_id') {
      run(invalidAggregationItem, { arg: args[0], who: 'CONTROL_BY_ID', controlIds, data });
      if (CONTROL_METHOD_ID_ARG.includes(args[1]?.value)) run(invalidAggregationItem, { arg: args[2], who: 'CONTROL_BY_ID', controlIds, data });
    }
    for (const at of ACTION_ID_SLOTS[action] ?? []) run(invalidAggregationItem, { arg: args[at], who: action.toUpperCase(), controlIds, data });

    run(frontendActionTooNew, { action, args, minUi5 });
    run(controlCallArgCount, { action, args });
    run(controlCallArgKind, { action, args, src });
    run(invalidFrontendAction, { action, args, data, shape: 'args', src });
  }

  run(controlStateLostOnRebuild, { src, stateWires });
  run(navigationLostOnRebuild, { containerPages, navWires, src });
  return frontendRaised;
}
