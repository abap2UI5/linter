/*
 * deprecations — what abap2UI5 deprecated, removed or moved out, as data.
 *
 * The facts are the documentation's: resources/deprecations.md of
 * abap2UI5/docs, published as api/deprecations.json and vendored here
 * (data/deprecations.json, mirrored into lib/abap2ui5-deprecations.mjs by
 * scripts/sync-deprecations.mjs - docs/agents/data.md). Nothing about a
 * release, a successor or a repository is typed in this file or in a rule:
 * a rule asks here, and a sentence is built from the entry.
 *
 * One entry per name: { name, kind, of?, pattern?, status, replacement,
 * movedTo?, since, note? }. `kind` is what the name is - class, interface,
 * dictionary-object, method, parameter, constant, attribute, field - and
 * `of` the method a parameter or field belongs to. An entry with `pattern`
 * matches every name its `*` stands for; an exact entry outranks a pattern
 * and a longer pattern a shorter one (the file's own `matching` rule).
 */
import { ABAP2UI5_DEPRECATIONS } from './abap2ui5-deprecations.mjs';

export const DEPRECATIONS = ABAP2UI5_DEPRECATIONS.entries;

/** The kinds a global object name can have. */
export const OBJECT_KINDS = Object.freeze(['class', 'interface', 'dictionary-object']);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = new Map();
const patterns = [];
for (const e of DEPRECATIONS) {
  if (e.pattern) patterns.push({ entry: e, re: new RegExp(`^${e.name.split('*').map(escape).join('\\w*')}$`) });
  else exact.set(`${e.kind} ${e.of ?? ''} ${e.name}`, e);
}
// the longest pattern first: `z2ui5_cl_util_api*` before `z2ui5_cl_util*`
patterns.sort((a, b) => b.entry.name.length - a.entry.name.length);

/** The entry for a name of one kind (and, for a parameter or a field, of one
 *  method), or null. Case-insensitive, like ABAP. */
export function deprecationOf(name, kind, of = '') {
  return exact.get(`${kind} ${String(of).toLowerCase()} ${String(name).toLowerCase()}`) ?? null;
}

/** The entry for a global object name - a class, an interface, a dictionary
 *  object - exact before pattern. `how` says which of the two matched. */
export function objectDeprecation(name) {
  const n = String(name).toLowerCase();
  for (const kind of OBJECT_KINDS) {
    const e = exact.get(`${kind}  ${n}`);
    if (e) return { entry: e, how: 'exact' };
  }
  const p = patterns.find((x) => OBJECT_KINDS.includes(x.entry.kind) && x.re.test(n));
  return p ? { entry: p.entry, how: 'pattern' } : null;
}

/** Every entry of one kind. */
export const deprecationsOfKind = (kind) => DEPRECATIONS.filter((e) => e.kind === kind);

/** "since 1.151.0" for a name the data dates, "" otherwise - for a rule whose
 *  sentence is its own and only lacks the release. */
export const sinceOfObject = (name) => objectDeprecation(name)?.entry.since ?? null;
