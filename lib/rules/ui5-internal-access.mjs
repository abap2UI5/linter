import { defineRule } from '../rule.mjs';
import { literalEnd } from '../abap.mjs';

/* The private FIELDS of a UI5 object read in a client expression - the
 * second half of ui5-internal-access, beside the member tables below. An
 * event argument, a frontend-action argument or an expression binding that
 * walks `$event.oSource.sId`, `$event.mParameters` or `….oParent` reads
 * state UI5 keeps in fields named the Hungarian way - a lower-case type
 * letter, then the name - and none of them is API: the expression works
 * because the field happens to be there in this release, and a release that
 * renames or drops it breaks the wire with nothing raised (the argument
 * arrives as `undefined`, or the whole event is lost when the read throws).
 * Every one the corpora read has a public getter, which is what the fix
 * writes: `$event.getSource().getId()`.
 *
 * Read inside literals only, and only inside a literal that IS a client
 * expression - one that names `$event`, `$source`, `$parameters`,
 * `$controller` or opens a `${` binding - so a sentence about `oSource` in a
 * MessageStrip is not a finding. A member followed by `(` is a METHOD call
 * and public by definition (`.getBindingContext( )`); only a property read
 * is judged. The four member tables are left to the scan below, which reads
 * them anywhere. */
const PRIVATE_MEMBER_GETTER = Object.freeze({
  oSource: 'getSource()', oParent: 'getParent()', sId: 'getId()', mParameters: 'getParameters()',
});

const MEMBER_TABLES = /^m(?:Properties|Aggregations|BindingInfos|EventRegistry)$/;

const CLIENT_EXPRESSION = /\$(?:event|source|parameters|controller)\b|\$\{/;

function privateFields(src, report) {
  const opener = /[`|']/g;
  for (let m = opener.exec(src); m; m = opener.exec(src)) {
    const start = m.index;
    const end = literalEnd(src, start);
    opener.lastIndex = end + 1;
    const text = src.slice(start + 1, end);
    if (!CLIENT_EXPRESSION.test(text)) continue;
    for (const r of text.matchAll(/\.([a-z][A-Z][A-Za-z0-9_]*)\b(?!\s*\()/g)) {
      if (MEMBER_TABLES.test(r[1])) continue;
      const at = start + 1 + r.index;
      const getter = PRIVATE_MEMBER_GETTER[r[1]];
      report({
        value: r[1], dedupe: String(at), offset: at + 1,
        ...(getter ? { member: getter, fixes: [{ start: at + 1, end: at + 1 + r[1].length, text: getter }] } : {}),
      });
    }
  }
}

function check({ src, report }) {
  /* Private UI5 internals reached from ABAP-built wires or bindings.
   * mProperties & friends are UI5's internal member tables — no API
   * contract, renamed or restructured across patches without notice. A wire
   * that reads them works on the UI5 version it was written against and
   * breaks silently on the next one. Restructure to a two-way binding or a
   * public parameter. */
  for (const m of src.matchAll(/\bm(?:Properties|Aggregations|BindingInfos|EventRegistry)\b/g)) {
    report({ value: m[0], offset: m.index });
  }
  privateFields(src, report);
}

export default defineRule({
  id: 'ui5-internal-access',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  fixable: true,
  message: (f) => {
    return f.member
      ? `${f.value} is a private field of a UI5 object — no API contract, a release that renames it breaks the wire with nothing raised; read it through the public ${f.member}`
      : `${f.value} is a private UI5 internal — no API contract, it changes across UI5 patches without notice; restructure to a two-way binding or a public parameter`;
  },
  check,
});
