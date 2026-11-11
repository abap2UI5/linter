import { defineRule } from '../rule.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';

function check({ attrs, code, src, report }) {
  /* A `_bind( )` on the WORK AREA of a LOOP - the row a view is built per
   * row of. Three shapes, none of them a row binding: a work area that is an
   * attribute (`LOOP AT mt INTO ms_row`) binds ONE path, `/MS_ROW/FIELD`, so
   * every row's control shows the last row's value; a local (`INTO
   * DATA(row)`) or a field symbol (`ASSIGNING <row>`) binds a path the
   * model never carries, and the first roundtrip answers BINDING_ERROR. The
   * framework's own answer is the cell binding: `_bind( val = <row>-field
   * tab = mt tab_index = sy-tabix )`, which is a `/MT/<n>/FIELD` path — and
   * val has to BE the row component (a reference into the table), which is
   * what ASSIGNING gives and INTO does not. So the fix exists for the
   * ASSIGNING shape only, and only while nothing between the loop header
   * and the bind has moved sy-tabix (a READ TABLE, an inner LOOP, a DO). A
   * call that already carries `tab =` is the remedy and is not reported. */
  for (const lp of code.matchAll(/\bLOOP\s+AT\s+((?:me->)?[\w]+(?:-\w+)*)\s+(?:(?:REFERENCE\s+)?INTO|ASSIGNING)\s+(?:DATA\(\s*(\w+)\s*\)|FIELD-SYMBOL\(\s*(<\w+>)\s*\)|(<\w+>|\w+))/gi)) {
    if (/\bREFERENCE\s+INTO\b/i.test(lp[0])) continue;
    const wa = lp[2] || lp[3] || lp[4];
    const kind = lp[2] ? 'local' : wa.startsWith('<') ? 'field symbol' : attrs.has(wa.toUpperCase()) ? 'attribute' : 'local';
    // the block: to the ENDLOOP at this loop's own level
    const tokenRe = /\b(LOOP|ENDLOOP|ENDMETHOD)\b/gi;
    tokenRe.lastIndex = lp.index + lp[0].length;
    let depth = 0;
    let blockEnd = code.length;
    let t;
    while ((t = tokenRe.exec(code)) !== null) {
      const k = t[1].toUpperCase();
      if (k === 'LOOP') depth++;
      else if (k === 'ENDLOOP') { if (depth === 0) { blockEnd = t.index; break; } depth--; }
      else { blockEnd = t.index; break; }
    }
    const block = code.slice(lp.index + lp[0].length, blockEnd);
    const escaped = wa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isWa = new RegExp(`^(?:me->)?${escaped}(?:-\\w+)*$`, 'i');
    for (const m of block.matchAll(/client->_bind(?:_edit|_path)?\s*\(/gi)) {
      const open = lp.index + lp[0].length + m.index + m[0].length - 1;
      const { body } = parenRegion(src, open);
      if (body === undefined || /\btab\s*=/i.test(body)) continue;
      const marks = namedArgMarks(body);
      const val = marks.length ? marks.find((a) => a.name === 'val')?.value : body.trim();
      if (!val || !isWa.test(val)) continue;
      const clobbered = /\b(?:READ\s+TABLE|LOOP\s+AT|DO|WHILE)\b/i.test(block.slice(0, m.index));
      const onlyVal = marks.length === 0 || (marks.length === 1 && marks[0].name === 'val');
      const fixes = kind === 'field symbol' && onlyVal && !clobbered
        ? [{ start: open + 1, end: open + 1 + body.length, text: ` val = ${val} tab = ${lp[1]} tab_index = sy-tabix ` }]
        : null;
      report({
        control: lp[1], member: kind, value: val, offset: open - m[0].length + 1,
        ...(fixes ? { fixes } : {}),
      });
    }
  }
}

export default defineRule({
  id: 'loop-work-area-bound',
  severity: 'warning',
  category: 'bindings',
  scope: 'app',
  summary: 'a `_bind( )` on the work area of a LOOP — one path for every row',
  detail: 'A view built per row of a table, binding the row through the loop\'s work area. Three shapes, none of them a row binding: a work area that is an attribute (`LOOP AT mt INTO ms_row`) binds ONE path, `/MS_ROW/FIELD`, so every row\'s control shows the last row\'s value; a local (`INTO DATA(row)`) or a field symbol (`ASSIGNING <row>`) binds a path the model never carries, and the first roundtrip answers BINDING_ERROR. The framework\'s answer is the cell binding: `_bind( val = <row>-field tab = mt tab_index = sy-tabix )`, a `/MT/<n>/FIELD` path — and `val` has to BE the row component, a reference into the table, which is what ASSIGNING gives and INTO does not. A call that already carries `tab =` is that remedy and is not reported. The other way round is usually better still: bind the table on the aggregation and keep the template\'s fields relative.',
  example: `LOOP AT mt_rows ASSIGNING FIELD-SYMBOL(<row>).
  view->tag( \`Input\` )->a( n = \`value\` v = client->_bind( <row>-name ) ).
ENDLOOP.`,
  remedy: `LOOP AT mt_rows ASSIGNING FIELD-SYMBOL(<row>).
  view->tag( \`Input\` )->a( n = \`value\` v = client->_bind( val = <row>-name tab = mt_rows tab_index = sy-tabix ) ).
ENDLOOP.`,
  fixNote: 'For the ASSIGNING shape, where the call carries only `val` and nothing between the loop header and the call has moved `sy-tabix` (no READ TABLE, inner LOOP or DO): the call becomes `_bind( val = <row>-field tab = <table> tab_index = sy-tabix )`. An INTO work area is a copy the framework refuses as a cell, so that shape keeps the finding.',
  message: (f) => {
    return f.member === 'attribute'
      ? `client->_bind( ${f.value} ) inside LOOP AT ${f.control} binds the work area ${f.value.split('-')[0]}, one attribute — every row's control shares that one path and shows the last row's value; bind the row itself: _bind( val = <row>-field tab = ${f.control} tab_index = sy-tabix ) with an ASSIGNING loop`
      : `client->_bind( ${f.value} ) inside LOOP AT ${f.control} binds a ${f.member} the model never carries — BINDING_ERROR on the first roundtrip; bind the row itself: _bind( val = ${f.value} tab = ${f.control} tab_index = sy-tabix )`;
  },
  check,
});
