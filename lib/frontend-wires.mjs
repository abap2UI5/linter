/*
 * frontend-wires — every \`client->_event_client( )\` / \`follow_up_action( )\`
 * wire in one class: the frontend actions, their arguments and the control ids
 * they name.
 *
 * Its own module because it is its own subject. The frontend resolves each of
 * these against a CLOSED set mirrored in lib/frontend-actions.mjs and, on a
 * miss, mostly returns without even a log - which is what makes this family
 * worth 480 lines and what makes every one of its rules a silent-failure rule.
 * Nothing here is shared with the rules around it: it reads the source and the
 * metadata snapshot, and reports.
 *
 * Called from checkAbapRules with that entry point's own \`report( )\`, so the
 * collapse-repeats rule and the order of the findings are unchanged by the
 * move - which is what \`npm test\` proves.
 */
import { parenRegion } from './abap.mjs';
import { caseMatch } from './suggest.mjs';
import {
  ACTION_ARGS, ACTION_ID_SLOTS, CONTROL_METHOD_ID_ARG, OBJECT_ARG_METHODS,
  FRONTEND_EVENTS, FRONTEND_EVENT_ALIASES, SERVER_EVENTS, VIEW_SLOTS,
  CS_VIEW_CONSTANT, FILTER_OPERATORS, GLOBAL_TARGET_SINCE, CONTROL_METHOD_KINDS,
  URLHELPER_PARAMS,
  SHORTCUT_MODIFIERS, SHORTCUT_ALIASES, deniedControlMethod,
} from './frontend-actions.mjs';
import { memberSection, propertyDecl, withinUi5Floor } from './properties.mjs';
import {
  literalElements, displayPathMethods, methodSpans, bindableAnywhere, UNBINDABLE_TYPES,
} from './abap-source.mjs';

/* Returns the backend event names it saw raised FROM the frontend
 * (KEYBOARD_SHORTCUT, START_TIMER), which the caller judges against the
 * class's own WHEN branches. */
export function checkFrontendWires({
  src, code, report, viewIds, data, controlIds, minUi5 = '1.71',
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
  /* A literal that reaches the frontend as a STATIC id, or null: a
   * $-prefixed value is resolved client-side before dispatch
   * ($event.oSource.sId, ${...} expressions) — those are exactly how a
   * sample opens a popover by whoever was pressed, and no declared-id set
   * can judge them. The aggregation-item form (`id/agg/n`) is judged on its
   * id segment. */
  const staticIdOf = (v) => {
    const s = String(v ?? '');
    if (!s || s.startsWith('$') || s.includes('{')) return null;
    return s.split('/')[0];
  };

  /* The aggregation-item form `<id>/<aggregation>/<index>`, 0-based, which
   * resolveControl accepts wherever an argument takes a control id. It exists
   * because a cloned aggregation item has no id the BACKEND can know — the
   * rendered one carries the view prefix the framework assigns at runtime —
   * so the item is addressed positionally and resolved in the browser.
   *
   * Two ways to get it wrong, and the id checks around this one see neither,
   * because they judge the HEAD segment alone (`staticIdOf` splits on `/`):
   *
   *   - a slashed value that does not MATCH the shape (a non-numeric index, a
   *     fourth segment) never enters the aggregation path at all. It falls
   *     through to a plain `byId` of the whole string, which resolves nothing
   *     and misses exactly as silently as any other unknown id.
   *   - a shape that matches but names an aggregation the control does not
   *     declare: `getAggregation` returns nothing and the frontend logs
   *     "no items" — the wire is dead and the ABAP is unchanged.
   *
   * The aggregation half is judged only when the head id resolves to a control
   * the snapshot knows, the same trust condition every other id rule takes. */
  const AGG_ITEM = /^([^/]+)\/([A-Za-z_]\w*)\/(\d+)$/;
  const checkAggItem = (arg, who) => {
    const s = String(arg?.value ?? '');
    if (!s.includes('/') || s.startsWith('$') || s.includes('{')) return;
    const m = AGG_ITEM.exec(s);
    if (!m) {
      report({
        type: 'invalid-aggregation-item', control: who, member: 'id',
        value: s.slice(0, 40), offset: arg.offset,
      });
      return;
    }
    const cls = controlIds ? controlIds[m[1]] : null;
    if (!cls || !data?.[cls]) return;
    if (memberSection(data, cls, m[2]) !== 'aggregations') {
      report({
        type: 'invalid-aggregation-item', control: cls, member: m[2],
        value: s.slice(0, 40), offset: arg.offset,
      });
    }
  };

  /* A view slot RETYPED as a literal where the constant exists.
   *
   * `unknown-view-slot` next door catches the spelling that misses. This is
   * the same mistake one keystroke earlier: `view = \`MAIN\`` is correct today
   * and is one rename away from being the finding above, because nothing
   * compile-checks it. `client->cs_view-main` does not have that failure mode
   * at all — the name is resolved by the ABAP compiler, so `cs_view-mian` is
   * a syntax error rather than a wire that dispatches to no view — and it is
   * the only spelling that survives the pairing nobody remembers
   * (`cs_view-nested` is `NEST`, not `NESTED`).
   *
   * A hint, not a warning: the literal WORKS. It is offered with a fix,
   * which is the whole point — the correction is one exact substitution with
   * nothing to guess. Only an exact slot value is judged; a value that merely
   * upper-cases to one is a different rule's business. */
  /* A JSON payload as ABAP can WRITE it.
   *
   * A |…| string template escapes its braces (`|\{ "TEL": "x" \}|`) because an
   * unescaped one opens an embedded expression — so the literal this pass
   * reads carries backslashes that the RUNTIME has already removed by the time
   * the frontend sees it. Parsing the raw text alone therefore called every
   * template-written payload malformed, which is the one spelling the corpus
   * uses most. Tried raw first, so a backtick literal (which needs no escapes)
   * is unaffected. */
  const parsePayload = (raw) => {
    for (const text of [String(raw), String(raw).replace(/\\([{}|])/g, '$1')]) {
      try { return JSON.parse(text); } catch { /* try the de-escaped form */ }
    }
    return undefined;
  };

  /* did you mean, for an id no view declares: the one declared id this is
   * up to case (`messageview` for `messageView`), rewritten inside the
   * literal's own span — literalElements carries it for exactly this. */
  const idSuggestion = (arg, ids) => {
    const suggestion = caseMatch(String(arg.value), ids);
    if (!suggestion) return {};
    const fix = arg.litStart != null
      ? { fixes: [{ start: arg.litStart + 1, end: arg.litEnd - 1, text: suggestion }] }
      : {};
    return { written: String(arg.value), suggestion, ...fix };
  };

  const literalSlot = (value, start, end) => {
    const constant = CS_VIEW_CONSTANT[String(value)];
    if (!constant || start == null || end == null) return;
    const f = { type: 'literal-view-slot', member: 'view', value: String(value), offset: start };
    f.fixes = [{ start, end, text: `client->cs_view-${constant}` }];
    report(f);
  };

  /* Backend events raised from the FRONTEND: a KEYBOARD_SHORTCUT registration
   * dispatches its event name as eB(...) when the combo fires, START_TIMER
   * its callback when the timer expires. A name no branch handles is the same
   * dead wire as an unhandled client->_event( ) — collected in the loop,
   * judged after it. */
  const frontendRaised = [];

  /* Candidate rebuild-survival wires, judged AFTER the loop: the verdict is
   * not a property of one wire but of the whole class — a setter issued from
   * an event handler is fine as long as SOME method on the display path
   * issues it too. */
  const stateWires = [];

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
          report({
            type: 'raw-javascript-to-frontend', member: 'follow_up_action',
            value: text.replace(/\s+/g, ' ').slice(0, 40), offset: base + lit.index,
          });
        } else {
          report({
            type: 'unknown-frontend-action', value: text.replace(/\s+/g, ' ').slice(0, 40),
            allowed: [...FRONTEND_EVENTS].sort(), offset: base + lit.index,
          });
        }
        continue;
      }
      if (!FRONTEND_EVENTS.includes(text) && !FRONTEND_EVENT_ALIASES.includes(text)
          && !SERVER_EVENTS.includes(text)) {
        report({
          type: 'unknown-frontend-action', value: text,
          allowed: [...FRONTEND_EVENTS].sort(), offset: base + lit.index,
        });
        continue;
      }
      action = text.toLowerCase();
    }

    /* The view PARAMETER names a slot, and the slot keys are case-sensitive
     * on the wire (an ABAP string compare on the server, an object key in the
     * browser). `NESTED` — the natural guess for cs_view-nested, whose VALUE
     * is `NEST` — misses, and for CONTROL_BY_ID a wrong slot is worse than
     * none: it SUPPRESSES the global id fallback, so the wire dies although
     * the id exists. */
    const vm = callBody.match(/\bview\s*=\s*(([`'])([^`']*)\2)/i);
    if (vm && !VIEW_SLOTS.includes(vm[3])) {
      report({ type: 'unknown-view-slot', member: 'view', value: vm[3], offset: base + vm.index });
    } else if (vm) {
      /* A slot spelled RIGHT, and still worth a word: the value is retyped
       * where a compile-checked constant exists. See literalSlot( ). */
      const at = base + vm.index + vm[0].indexOf(vm[1]);
      literalSlot(vm[3], at, at + vm[1].length);
    }

    // `VALUE #( )` or the typed `VALUE string_table( )` - the same table
    const tm = callBody.match(/\bt_arg\s*=\s*VALUE\s+(?:#|\w+)?\s*\(/i);
    const argOpen = tm ? callBody.indexOf('(', tm.index + tm[0].length - 1) : -1;
    const args = tm ? literalElements(parenRegion(callBody, argOpen).body, base + argOpen + 1) : [];

    /* CONTROL_BY_ID addresses a control by the id the view gave it. A literal
     * id that no view of this class declares resolves to nothing: the
     * frontend logs "control not found" and the wire silently does nothing —
     * no exception, no failed render, and the property gate never sees the
     * ABAP side of it. Only judged when every id attribute in the class is a
     * literal (see viewIds), so a class that builds ids dynamically is left
     * alone rather than guessed at. The aggregation-item form (`id/agg/n`)
     * is judged on its id segment only. */
    if (action === 'control_by_id' && viewIds && staticIdOf(args[0]?.value)
        && !viewIds.has(staticIdOf(args[0].value))) {
      report({
        type: 'frontend-action-unknown-id', control: 'CONTROL_BY_ID', member: 'id',
        value: args[0].value, allowed: [...viewIds].sort(), offset: args[0].offset,
        ...idSuggestion(args[0], viewIds),
      });
      continue;
    }

    /* A CONTROL_BY_ID method whose own first argument is a control id too
     * (`to` targets, `openBy`/`toggleBy` anchors, `setSelectedSection`, …) —
     * the kinds CONTROL_METHODS declares as controlId/anchor. A miss resolves
     * nothing and logs. An EMPTY argument stays silent: for the OrNull kinds
     * it is the documented way to clear. */
    if (action === 'control_by_id' && viewIds && CONTROL_METHOD_ID_ARG.includes(args[1]?.value)
        && staticIdOf(args[2]?.value) && !viewIds.has(staticIdOf(args[2].value))) {
      report({
        type: 'frontend-action-unknown-id', control: 'CONTROL_BY_ID', member: args[1].value,
        value: args[2].value, allowed: [...viewIds].sort(), offset: args[2].offset,
        ...idSuggestion(args[2], viewIds),
      });
      continue;
    }

    /* A JSON payload the runtime silently downgrades: the `object`-kind
     * methods run their argument through castArg, whose catch turns a literal
     * that does not parse as JSON into `{}` — setSticky then un-sticks
     * everything instead of failing. For the enum-array payloads the VALUES
     * are checkable too: an unknown sap.m.Sticky key is dropped by UI5 with
     * the same silence. */
    if (action === 'control_by_id' && args[1]?.value && Object.hasOwn(OBJECT_ARG_METHODS, args[1].value)) {
      const payload = args[2];
      if (payload && payload.value !== null && payload.value !== '') {
        const parsed = parsePayload(payload.value);
        if (parsed === undefined) {
          report({
            type: 'invalid-action-payload', control: 'CONTROL_BY_ID', member: args[1].value,
            value: String(payload.value).slice(0, 40), offset: payload.offset,
          });
        } else {
          const allowed = OBJECT_ARG_METHODS[args[1].value]
            ? data?.__enums?.[OBJECT_ARG_METHODS[args[1].value]] : null;
          const bad = allowed && Array.isArray(parsed) ? parsed.find((v) => !allowed.includes(v)) : undefined;
          if (bad !== undefined) {
            report({
              type: 'invalid-action-payload', control: 'CONTROL_BY_ID', member: args[1].value,
              value: String(bad).slice(0, 40), allowed, offset: payload.offset,
            });
          }
        }
      }
    }

    /* The compound filter form: ONE JSON param of groups, each group rows of
     * [path, operator, value1, value2]. A malformed literal is rejected with
     * a log and the binding stays untouched; a row operator outside the
     * whitelist the same. Only a literal payload is judged. */
    if (action === 'binding_call' && args[2]?.value === 'filter'
        && typeof args[3]?.value === 'string' && args[3].value.trimStart().startsWith('[')) {
      const groups = parsePayload(args[3].value);
      if (groups === undefined || !Array.isArray(groups)) {
        report({
          type: 'invalid-action-payload', control: 'BINDING_CALL', member: 'filter groups',
          value: String(args[3].value).slice(0, 40), offset: args[3].offset,
        });
      } else {
        /* the same walk buildFilterGroups does: an array of GROUPS, each an
         * array of [path, operator, v1, v2] ROWS (an empty groups array is
         * the clear form and fine). A row that is not that shape, or an
         * operator off the whitelist, is logged upstream and the binding
         * stays untouched. */
        /* Every element dropped by that same filter means the payload will
         * reach `binding.filter([])` — the binding is CLEARED, not filtered,
         * and nothing is logged on that path because the ROOT is an array so
         * the guard above passes. The object form `[{"path":…}]` is how this
         * is written by mistake; an intentional clear is `[]`, which is empty
         * to begin with and not reported. */
        const usable = groups.filter((g) => Array.isArray(g) && g.length);
        if (groups.length && !usable.length) {
          report({
            type: 'filter-groups-not-arrays', control: 'BINDING_CALL', member: 'filter',
            value: String(args[3].value).slice(0, 40), offset: args[3].offset,
          });
        }
        outer: for (const group of usable) {
          for (const row of group) {
            if (!Array.isArray(row) || typeof row[0] !== 'string') {
              report({
                type: 'invalid-action-payload', control: 'BINDING_CALL', member: 'filter row',
                value: JSON.stringify(row)?.slice(0, 40), offset: args[3].offset,
              });
              break outer;
            }
            if (!FILTER_OPERATORS.includes(row[1])) {
              report({
                type: 'invalid-frontend-action', control: 'BINDING_CALL', member: 'filter operator',
                value: String(row[1]).slice(0, 40), allowed: FILTER_OPERATORS, offset: args[3].offset,
              });
              break outer;
            }
          }
        }
      }
    }

    /* URLHELPER's parameter OBJECT. `evUrlHelper` reads `args[2] ?? {}` and
     * picks named keys out of it, so a plain string in that slot is not a
     * wrong value but a wrong SHAPE: every lookup comes back undefined and
     * `triggerTel(undefined)` navigates to a bare `tel:` — the dialler opens
     * with no number, and nothing anywhere says so. One port shipped exactly
     * that on both its tel and its sms link, with a hand-written note saying
     * both had been seen working.
     *
     * The required key is checked too, and TRIGGER_SMS is the reason it is
     * worth checking: it reads `params.TEL`, the same key as TRIGGER_TEL, and
     * not the `SMS` or `NUMBER` anybody would write from memory. */
    if (action === 'urlhelper' && URLHELPER_PARAMS[args[0]?.value]) {
      const spec = URLHELPER_PARAMS[args[0].value];
      const payload = args[1];
      /* Read by SHAPE rather than by JSON.parse, and the corpus is what
       * settled that: the payload is written as a JS OBJECT LITERAL —
       * `|\{ URL: 'http://x', NEW_WINDOW: true \}|`, unquoted keys and single
       * quotes — which the backend converts on the way out. Strict JSON
       * rejects every one of those, so parsing it reported nine correct wires
       * and no defect at all. What IS decidable without a parser is the two
       * things that matter: whether the value is an object at all, and which
       * keys it names. */
      const text = String(payload?.value ?? '').replace(/\\([{}|])/g, '$1').trim();
      if (payload?.value != null && text !== '') {
        if (!text.startsWith('{')) {
          report({
            type: 'invalid-action-payload', control: 'URLHELPER', member: args[0].value,
            value: text.slice(0, 40), offset: payload.offset,
          });
        } else {
          const known = [...spec.required, ...spec.optional];
          const keys = [...text.matchAll(/[{,]\s*['"]?([A-Za-z_]\w*)['"]?\s*:/g)].map((k) => k[1]);
          const missing = spec.required.find((k) => !keys.includes(k));
          if (missing) {
            report({
              type: 'invalid-action-payload', control: 'URLHELPER', member: args[0].value,
              value: missing, allowed: known, missing: true, offset: payload.offset,
            });
          } else {
            const stray = keys.find((k) => !known.includes(k));
            if (stray !== undefined) {
              report({
                type: 'invalid-action-payload', control: 'URLHELPER', member: args[0].value,
                value: stray, allowed: known, stray: true, offset: payload.offset,
              });
            }
          }
        }
      }
    }

    /* KEYBOARD_SHORTCUT: a combo that names no non-modifier key is logged
     * and never registered — `Ctrl+Shift` binds nothing. The scope (t_arg@2)
     * is a slot key or a declared control id; anything else makes the
     * registration permanently ineligible, silently. And the EVENT (t_arg@1)
     * is a backend event like any client->_event( ) one — collected for the
     * handler check below. */
    if (action === 'keyboard_shortcut') {
      const combo = args[0];
      if (combo && combo.value !== null) {
        const parts = String(combo.value).split('+')
          .map((p) => { const t = p.trim().toLowerCase(); return SHORTCUT_ALIASES[t] ?? t; })
          .filter((p) => p !== '');
        if (!parts.some((p) => !SHORTCUT_MODIFIERS.includes(p))) {
          report({ type: 'invalid-keyboard-shortcut', member: 'combo', value: String(combo.value).slice(0, 40), offset: combo.offset });
        }
      }
      const scope = args[2];
      if (staticIdOf(scope?.value) && !VIEW_SLOTS.includes(String(scope.value).toUpperCase())
          && viewIds && !viewIds.has(scope.value)) {
        report({
          type: 'frontend-action-unknown-id', control: 'KEYBOARD_SHORTCUT', member: 'scope',
          value: scope.value, allowed: [...VIEW_SLOTS, ...[...viewIds].sort()], offset: scope.offset,
          ...idSuggestion(scope, viewIds),
        });
      }
      /* The scope may be a slot or a control id, so only an EXACT slot value
       * is judged here — that is the one spelling a constant can replace, and
       * a control id that merely upper-cases to one is left alone. */
      if (scope?.value) literalSlot(scope.value, scope.litStart, scope.litEnd);
    }
    if ((action === 'keyboard_shortcut' || action === 'start_timer')) {
      const ev = action === 'keyboard_shortcut' ? args[1] : args[0];
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
      if (slotArg?.value && !/^\d+$/.test(slotArg.value) && !VIEW_SLOTS.includes(slotArg.value)) {
        report({ type: 'unknown-view-slot', member: 'view', value: slotArg.value, offset: slotArg.offset });
      } else if (slotArg?.value) {
        literalSlot(slotArg.value, slotArg.litStart, slotArg.litEnd);
      }
    }

    /* The other id-addressed actions, same trust condition as CONTROL_BY_ID
     * (see ACTION_ID_SLOTS for who fails how quietly). */
    const idSlots = ACTION_ID_SLOTS[action];
    if (idSlots && viewIds) {
      let miss = false;
      for (const at of idSlots) {
        const arg = args[at];
        if (staticIdOf(arg?.value) && !viewIds.has(arg.value)) {
          report({
            type: 'frontend-action-unknown-id', control: action.toUpperCase(), member: 'id',
            value: arg.value, allowed: [...viewIds].sort(), offset: arg.offset,
            ...idSuggestion(arg, viewIds),
          });
          miss = true;
        }
      }
      if (miss) continue;
    }

    /* An imperative setter where the control has a bindable PROPERTY of that
     * name. Binding it two-way keeps the state in the model, where it survives
     * a view rebuild and a draft restore — an action does not — and it is the
     * project rule ("prefer a bindable property over a frontend action").
     * Only PROPERTIES qualify: an association (ObjectPageLayout.selectedSection)
     * and an aggregation cannot be data-bound, so driving those imperatively is
     * the only way and is never reported. */
    if (action === 'control_by_id' && data && controlIds) {
      const setter = String(args[1]?.value ?? '').match(/^set([A-Z]\w*)$/);
      const control = args[0]?.value ? controlIds[args[0].value] : null;
      if (setter && control) {
        const prop = setter[1][0].toLowerCase() + setter[1].slice(1);
        /* A property whose type is a live JS value (a callback, a DOM node)
         * cannot travel in a JSON model — sap.m.MessagePopover.asyncURLHandler
         * is exactly that, which is why the framework names a built-in policy
         * instead. Those stay imperative by nature, not by choice. */
        const decl = propertyDecl(data, control, prop);
        const bindable = decl && !['function', 'object', 'any'].includes(decl.type);
        if (bindable && memberSection(data, control, prop) === 'properties') {
          report({
            type: 'settable-property-via-action', control, member: prop,
            value: args[1].value, offset: args[1].offset,
          });
        }
      }
    }


    /* The inverse of the rule above, and precisely its blind spot: a
     * `set…( )` whose value CANNOT be bound.
     *
     * Three shapes qualify, and none of them can travel in the model:
     * an ASSOCIATION (`setNextStep`, `setSelectedSection`, `setActivePage`,
     * `setCurrentStep`), a FUNCTION-typed property (`setAsyncURLHandler`),
     * and a method that is no member at all (`setBadgeMinValue` — sap.m.Button
     * declares `badgeStyle` as its only badge property and keeps the bounds in
     * private fields). `settable-property-via-action` is silent for all three,
     * on purpose, because "bind it instead" is not available.
     *
     * What is available is re-issuing the call. A bound property survives a
     * rebuild because the binding re-applies; live control state does not —
     * `view_display( )` destroys the slot and `XMLView.create` builds a new
     * control tree from the XML. So a class that sets such state from an event
     * handler and never re-issues it from the display path loses it on the
     * next rebuild (a draft restore, a called app handing control back, any
     * later `view_display( )`), while the ABAP field describing it survives as
     * class state — and the app then claims a state it does not show.
     *
     * Two conditions keep it quiet, both measured on the 637-file corpus:
     *
     *   - the VALUE has to be non-literal. A constant carries no class state,
     *     so there is nothing for the rebuilt view to contradict:
     *     `setCurrentStep( 'ProductInfoStep' )` is a one-shot corrective jump
     *     and `setSelectedSection( '' )` a reset to null — both are right
     *     exactly once, and re-issuing either from view_display( ) would be
     *     the defect.
     *   - the control has to be resolvable, or the member has to be bindable
     *     on NO control in the snapshot. An unresolved id falls back to that
     *     global answer rather than to a guess.
     *
     * ORDER before the argument checks below: this is about the wire's place
     * in the class, not about its payload. */
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
       * rule; it is filed as abap2UI5's `navcontainer-position-not-reissued`,
       * and CONTROL_METHOD_ID_ARG in lib/frontend-actions.mjs already carries
       * the family as data. */
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

    /* A method the frontend denylist refuses. CONTROL_BY_ID's ALLOWED set is
     * open (any public control method), so nothing can whitelist it - but the
     * DENIED set is closed, and a wire naming one of those never reaches the
     * control: FrontendAction logs "method not allowed" and returns. That is
     * the same silence as an unknown id, and the same reason this family of
     * rules exists. The named per-aggregation mutators (removeAllItems,
     * destroyContent) are NOT denied and are never reported - only the generic
     * reflection variants that take the member name as an argument. */
    if (action === 'control_by_id' && args[1]?.value) {
      const why = deniedControlMethod(args[1].value);
      if (why) {
        report({
          type: 'denied-control-method', control: 'CONTROL_BY_ID', member: why,
          value: args[1].value, offset: args[1].offset,
        });
        continue;
      }
    }

    if (action === 'control_by_id' && args[1]?.value === '') {
      report({
        type: 'invalid-frontend-action', control: 'CONTROL_BY_ID', member: 'view slot',
        value: '', offset: args[1].offset,
      });
      continue;
    }

    /* Every id-bearing argument may carry the aggregation-item form, so the
     * shape is judged wherever one is read: CONTROL_BY_ID's own target, the
     * methods whose first argument is an id too, and the id slots of the
     * other actions. */
    if (action === 'control_by_id') {
      checkAggItem(args[0], 'CONTROL_BY_ID');
      if (CONTROL_METHOD_ID_ARG.includes(args[1]?.value)) checkAggItem(args[2], 'CONTROL_BY_ID');
    }
    for (const at of ACTION_ID_SLOTS[action] ?? []) checkAggItem(args[at], action.toUpperCase());

    /* A CONTROL_GLOBAL target the running release does not carry. The four
     * lazily-required globals resolve to `undefined` below their release and
     * the dispatch hits its "not available" guard, so the wire is a no-op with
     * a console line — the same silence the rest of this family exists for,
     * and the version half of it that nothing judged. */
    if (action === 'control_global' && args[0]?.value && args[1]?.value) {
      const since = GLOBAL_TARGET_SINCE[`${String(args[0].value).toUpperCase()}.${args[1].value}`];
      if (since && !withinUi5Floor(since, minUi5)) {
        report({
          type: 'frontend-action-too-new', control: String(args[0].value).toUpperCase(),
          member: args[1].value, since, minUi5, offset: args[1].offset,
        });
      }
    }

    /* Arity and kind, for the control methods the frontend DECLARES (the
     * open, unlisted ones carry no declaration and are never judged here).
     *
     * `castArgs` slices the declared kinds, so an argument past them is not
     * passed to the control at all — it reads as intent and is dead weight.
     * The kinds themselves are load-bearing: `int` runs through `Number( )`,
     * so a non-numeric literal arrives as NaN and every comparison against it
     * is false; `bool` is `raw === "true" || raw === "X"`, so a literal that
     * is neither of those and none of the false spellings silently means
     * FALSE — `1`, `TRUE` and `abap_true` all switch the flag off. */
    if (action === 'control_by_id' && args[1]?.value) {
      const kinds = CONTROL_METHOD_KINDS[args[1].value];
      const sent = args.slice(2);
      if (kinds && sent.length > kinds.length) {
        report({
          type: 'control-call-arg-count', control: 'CONTROL_BY_ID', member: args[1].value,
          value: String(sent.length), count: kinds.length,
          offset: (sent[kinds.length] ?? args[1]).offset,
        });
      }
      for (let i = 0; kinds && i < Math.min(kinds.length, sent.length); i++) {
        const v = sent[i]?.value;
        if (v === null || v === undefined) continue; // not a literal
        /* …and neither is a value the CLIENT resolves before dispatch: a
         * `${…}` expression or a `$event` reference arrives as whatever the
         * browser computed, so judging its ABAP text as an int or a bool is
         * judging the wrong string. The id rules take the same exclusion. */
        if (String(v).startsWith('$') || String(v).includes('{')) continue;
        const bad = (kinds[i] === 'int' && !/^-?\d+$/.test(String(v).trim()))
          || (kinds[i] === 'bool' && !['X', 'true', '', ' ', 'false'].includes(String(v)));
        if (bad) {
          report({
            type: 'control-call-arg-kind', control: 'CONTROL_BY_ID', member: args[1].value,
            value: String(v).slice(0, 40), memberType: kinds[i], offset: sent[i].offset,
          });
        }
      }
    }

    for (const slot of ACTION_ARGS[action] ?? []) {
      const arg = args[slot.at];
      if (!arg || arg.value === null) continue; // absent or not a literal
      const allowed = slot.allowed(args.map((a) => a?.value), data);
      if (!allowed) continue; // the earlier slot is already wrong - one finding is enough
      if (!allowed.includes(arg.value)) {
        report({
          type: 'invalid-frontend-action', control: action.toUpperCase(), member: slot.name,
          value: arg.value, allowed, offset: arg.offset,
        });
        break;
      }
    }
  }

  /* The rebuild-survival verdict (see the candidate collector above). A wire
   * is silent when its own method is on the display path, or when the SAME
   * target (id + setter) is issued from a method that is — app 249's remedy,
   * where view_display( ) re-sends setBadgeMinValue/MaxValue from the accepted
   * bounds it kept as class state.
   *
   * A method that displays a POPUP or POPOVER counts too, and that is not a
   * concession: a control-call queued in the same roundtrip as a display runs
   * AFTER it (View1._runSystemActions is awaited before the T_CUSTOM phase
   * runs), so such a wire lands on the freshly built fragment by construction. */
  if (stateWires.length) {
    const onDisplayPath = displayPathMethods(src);
    const spans = methodSpans(src);
    const methodOf = (at) => spans.find((s) => at >= s.from && at < s.to)?.name ?? null;
    const reissued = new Set();
    for (const w of stateWires) {
      w.method = methodOf(w.offset);
      if (w.method && onDisplayPath.has(w.method)) reissued.add(`${w.id ?? ''}|${w.setter}`);
    }
    for (const w of stateWires) {
      if (w.method && onDisplayPath.has(w.method)) continue;
      if (reissued.has(`${w.id ?? ''}|${w.setter}`)) continue;
      report({
        type: 'control-state-lost-on-rebuild',
        control: w.control ?? 'CONTROL_BY_ID', member: w.setter,
        ...(w.id ? { value: w.id } : {}), offset: w.offset,
      });
    }
  }
  return frontendRaised;
}
