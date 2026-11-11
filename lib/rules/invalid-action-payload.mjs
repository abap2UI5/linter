import { defineRule } from '../rule.mjs';
import { OBJECT_ARG_METHODS, URLHELPER_PARAMS } from '../frontend-actions.mjs';
import { filterGroups, parsePayload } from '../wire-readers.mjs';

/* Three payload shapes of three actions, judged per wire: a CONTROL_BY_ID
 * `object`-kind argument, BINDING_CALL's filter groups, URLHELPER's
 * parameter object. */
function check({ action, args, data, report }) {
  if (action === 'control_by_id' && args[1]?.value && Object.hasOwn(OBJECT_ARG_METHODS, args[1].value)) {
    /* A JSON payload the runtime silently downgrades: the `object`-kind
     * methods run their argument through castArg, whose catch turns a literal
     * that does not parse as JSON into `{}` — setSticky then un-sticks
     * everything instead of failing. For the enum-array payloads the VALUES
     * are checkable too: an unknown sap.m.Sticky key is dropped by UI5 with
     * the same silence. */
    const payload = args[2];
    if (payload && payload.value !== null && payload.value !== '') {
      const parsed = parsePayload(payload.value);
      if (parsed === undefined) {
        report({ control: 'CONTROL_BY_ID', member: args[1].value, value: String(payload.value).slice(0, 40), offset: payload.offset });
      } else {
        const allowed = OBJECT_ARG_METHODS[args[1].value]
          ? data?.__enums?.[OBJECT_ARG_METHODS[args[1].value]] : null;
        const bad = allowed && Array.isArray(parsed) ? parsed.find((v) => !allowed.includes(v)) : undefined;
        if (bad !== undefined) {
          report({ control: 'CONTROL_BY_ID', member: args[1].value, value: String(bad).slice(0, 40), allowed, offset: payload.offset });
        }
      }
    }
  }

  /* The compound filter form (see filterGroups( )): a literal that is no
   * array of groups, or a group row that is no [path, operator, …] row. */
  if (action === 'binding_call' && args[2]?.value === 'filter'
      && typeof args[3]?.value === 'string' && args[3].value.trimStart().startsWith('[')) {
    const groups = parsePayload(args[3].value);
    if (groups === undefined || !Array.isArray(groups)) {
      report({ control: 'BINDING_CALL', member: 'filter groups', value: String(args[3].value).slice(0, 40), offset: args[3].offset });
    } else {
      const { stop } = filterGroups(groups);
      if (stop?.kind === 'shape') {
        report({ control: 'BINDING_CALL', member: 'filter row', value: JSON.stringify(stop.row)?.slice(0, 40), offset: args[3].offset });
      }
    }
  }

  if (action === 'urlhelper' && URLHELPER_PARAMS[args[0]?.value]) {
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
        report({ control: 'URLHELPER', member: args[0].value, value: text.slice(0, 40), offset: payload.offset });
      } else {
        const known = [...spec.required, ...spec.optional];
        const keys = [...text.matchAll(/[{,]\s*['"]?([A-Za-z_]\w*)['"]?\s*:/g)].map((k) => k[1]);
        const missing = spec.required.find((k) => !keys.includes(k));
        if (missing) {
          report({ control: 'URLHELPER', member: args[0].value, value: missing, allowed: known, missing: true, offset: payload.offset });
        } else {
          const stray = keys.find((k) => !known.includes(k));
          if (stray !== undefined) {
            report({ control: 'URLHELPER', member: args[0].value, value: stray, allowed: known, stray: true, offset: payload.offset });
          }
        }
      }
    }
  }
}

export default defineRule({
  id: 'invalid-action-payload',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a JSON action payload the runtime silently downgrades',
  detail: 'The `object`-kind control methods (`setSticky`, `setHiddenInPopin`, `setP13nData`) run their argument through `castArg`, whose catch turns a literal that does not parse as JSON into `{}` — a `setSticky` with a typo\'d payload then *un-sticks* everything instead of failing. For the enum-array payloads the values are judged too: an unknown `sap.m.Sticky` / `sap.ui.core.Priority` key is dropped by UI5 with the same silence. `BINDING_CALL`\'s compound filter-groups JSON is judged the same way, including each row\'s operator.',
  example: 't_arg = VALUE #( ( `table1` ) ( `setSticky` ) ( `ColumnHeaders` ) )   " not JSON -> {}',
  remedy: 't_arg = VALUE #( ( `table1` ) ( `setSticky` ) ( `["ColumnHeaders"]` ) )',
  message: (f) => {
    if (f.control === 'URLHELPER') {
      if (f.missing) {
        return `URLHELPER ${f.member} picks its parameters out of an OBJECT and the payload carries no ${f.value} key (it reads: ${[].concat(f.allowed || []).join(', ')}) — the lookup comes back undefined and the link opens empty`;
      }
      if (f.stray) {
        return `URLHELPER ${f.member} never reads '${f.value}' (it reads: ${[].concat(f.allowed || []).join(', ')}) — the key is dropped in silence`;
      }
      return `URLHELPER's second t_arg is an OBJECT the frontend picks named keys out of, and '${f.value}' is not one — every lookup comes back undefined, so triggerTel( ) navigates to a bare tel: with no number`;
    }
    return f.allowed
      ? `${f.control} ${f.member}: '${f.value}' is not a ${f.allowed.length ? `known value (allowed: ${[].concat(f.allowed || []).join(', ')})` : 'known value'} — UI5 drops it silently`
      : `${f.control} ${f.member}: the payload is not valid JSON (…${f.value}…) — castArg silently turns it into {}`;
  },
  check,
});
