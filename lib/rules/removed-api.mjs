import { defineRule } from '../rule.mjs';
import { insideSegments, literalSegments } from '../abap-helpers.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';
import { apiVerdict } from '../released-api.mjs';
import { deprecationOf, deprecationsOfKind, objectDeprecation } from '../deprecations.mjs';

/*
 * A name abap2UI5 REMOVED, or MOVED to another repository - read from the
 * deprecations the documentation publishes as data (lib/deprecations.mjs),
 * so the release, the successor and the repository in the sentence are the
 * documentation's and none is typed here.
 *
 * The reader this is for writes abap2UI5 from memory - a developer coming
 * back after a year, a language model trained on 2024's examples. abaplint
 * answers `Method "set_nav_back" not found` and stops; this says since when,
 * and what to write.
 *
 * What it judges, each only where the source shows whose name it is (rule 5,
 * "unknown is not missing"):
 *
 *   an object        z2ui5_cl_pop_js_loader, z2ui5_cl_util_api…
 *   a client method  client->set_nav_back( … )
 *   a constant       client->cs_event-wizard_set_next_step
 *   an attribute     z2ui5_if_app~check_initialized
 *   a parameter      client->window_bind_tab( t_sort = … )
 *   a field          client->_event( s_ctrl = VALUE #( check_allow_multi_req = … ) )
 *
 * What it leaves to the rule that already reports the very token - one
 * finding per token, and those rules carry a fix or a longer explanation:
 *
 *   non-released-api               every object its mirror knows (the moved
 *                                  src/99 objects, z2ui5_if_exit, …) - it
 *                                  takes the release from the same data
 *   obsolete-binder                _bind_edit( )
 *   obsolete-model-update          the five *_model_update( ) methods
 *   obsolete-bind-argument         _bind( view = … )
 *   get-viewname-removed           get( )-viewname
 *
 * `deprecated` entries are not this rule's: such a name still compiles, and
 * the obsolete-* rules say so with a fix. A field with no method to read it
 * in (`cs_config-title`) is not judged - the source does not show whose
 * `cs_config` it is.
 */
const COVERED = Object.freeze({
  method: new Set(['_bind_edit', 'view_model_update', 'nest_view_model_update', 'nest2_view_model_update', 'popup_model_update', 'popover_model_update']),
  parameter: new Set(['_bind view']),
  field: new Set(['get viewname']),
});

const gone = (e) => e && (e.status === 'removed' || e.status === 'moved');

function check({ src, report, ownObjects = null }) {
  const inLiteral = insideSegments(literalSegments(src));
  const hit = (entry, name, offset, extra = {}) => report({
    value: name,
    member: entry.kind,
    status: entry.status,
    since: entry.since,
    replacement: entry.replacement,
    movedTo: entry.movedTo,
    of: entry.of,
    // a moved name compiles where its repository is installed; a removed one nowhere
    ...(entry.status === 'moved' ? { severity: 'warning' } : {}),
    dedupe: String(offset),
    offset,
    ...extra,
  });

  // ---- objects ------------------------------------------------------------
  const own = new Set([...src.matchAll(/\b(?:CLASS|INTERFACE)\s+(z2ui5_\w+)/gi)].map((m) => m[1].toLowerCase()));
  for (const name of ownObjects ?? []) own.add(String(name).toLowerCase());
  for (const m of src.matchAll(/\bz2ui5_\w+/gi)) {
    const name = m[0].toLowerCase();
    if (own.has(name) || inLiteral(m.index)) continue;
    if (apiVerdict(name)) continue; // non-released-api reports this token
    const found = objectDeprecation(name);
    if (!found || !gone(found.entry)) continue;
    /* A name only a MOVED pattern matches is one nobody listed: the objects
     * that moved are enumerated (released-api.mjs, checked upstream), so this
     * is somebody's own `z2ui5_cl_util…` class in a package this run does
     * not see. A removed pattern has no such second reading. */
    if (found.how === 'pattern' && found.entry.status === 'moved') continue;
    hit(found.entry, name, m.index);
  }

  // ---- attributes of an interface: z2ui5_if_app~check_initialized -----------
  for (const e of deprecationsOfKind('attribute')) {
    if (!gone(e)) continue;
    for (const m of src.matchAll(new RegExp(`\\b${e.name.replace('~', '\\s*~\\s*')}\\b`, 'gi'))) {
      if (!inLiteral(m.index)) hit(e, e.name, m.index);
    }
  }

  // ---- constants: client->cs_event-name, z2ui5_if_client=>cs_event-name ------
  for (const m of src.matchAll(/(?:z2ui5_if_client\s*=>|->)\s*(cs_\w+-\w+)/gi)) {
    if (inLiteral(m.index)) continue;
    const e = deprecationOf(m[1], 'constant');
    if (gone(e)) hit(e, e.name, m.index + m[0].length - m[1].length);
  }

  // ---- client methods, and what a call passes --------------------------------
  for (const m of src.matchAll(/\b\w*client\s*->\s*(\w+)\s*\(/gi)) {
    if (inLiteral(m.index)) continue;
    const method = m[1].toLowerCase();
    const at = m.index + m[0].lastIndexOf(m[1]);
    const e = deprecationOf(method, 'method');
    if (gone(e)) {
      if (!COVERED.method.has(method)) hit(e, method, at);
      continue;
    }
    const params = deprecationsOfKind('parameter').filter((p) => p.of === method && gone(p) && !COVERED.parameter.has(`${method} ${p.name}`));
    const fields = deprecationsOfKind('field').filter((p) => p.of === method && gone(p) && !COVERED.field.has(`${method} ${p.name}`));
    if (!params.length && !fields.length) continue;
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const marks = namedArgMarks(body);
    for (const p of params) {
      const arg = marks.find((a) => a.name === p.name);
      if (arg) hit(p, p.name, open + 1 + arg.nameStart);
    }
    for (const f of fields) {
      // `s_ctrl-check_allow_multi_req`: the argument, and a component written in its value
      const [param, component] = f.name.split('-');
      if (!component || !marks.some((a) => a.name === param)) continue;
      const c = new RegExp(`\\b${component}\\s*=(?![>=])`, 'i').exec(body);
      if (c) hit(f, f.name, open + 1 + c.index);
    }
  }
}

const what = (f) => {
  switch (f.member) {
    case 'method': return `client->${f.value}( )`;
    case 'parameter': return `the parameter ${f.value} of ${f.of}( )`;
    case 'field': return `${f.value} of ${f.of}( )`;
    default: return f.value;
  }
};

export default defineRule({
  id: 'removed-api',
  severity: 'error',
  category: 'lifecycle',
  scope: 'class',
  message: (f) => (f.status === 'moved'
    ? `${what(f)} was moved out of abap2UI5 in ${f.since}, to github.com/${f.movedTo} — it compiles only where that repository is installed next to abap2UI5${f.replacement ? `; its successor is ${f.replacement}` : ''}`
    : `${what(f)} was removed from abap2UI5 in ${f.since} — it does not compile on that release or a later one${f.replacement ? `; instead: ${f.replacement}` : ''}`),
  check,
});
