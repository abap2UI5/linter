import { defineRule } from '../rule.mjs';

export default defineRule({
  id: 'delete-index-in-loop',
  severity: 'error',
  category: 'structure',
  scope: 'class',
  message: (f) => `DELETE ${f.member} INDEX sy-tabix inside a LOOP AT ${f.member} — deleting the current row shifts everything behind it while the loop cursor walks on, so the row after each deletion is SKIPPED; a sy-tabix reset by an inner construct dumps with TABLE_INVALID_INDEX instead. Collect what is kept and assign it back, or DELETE ${f.member} WHERE …`,
  check({ model, source, report }) {
    const { code: blank } = model;
    /* `DELETE itab INDEX sy-tabix` inside a `LOOP AT` over the SAME table,
     * reported only where sy-tabix is provably NOT the loop's own cursor any
     * more. The plain current-row delete is legal ABAP — the kernel adjusts the
     * loop cursor for a delete on the loop table, and @abaplint/runtime does
     * the same (`deleteIndex` decrements every registered loop controller), so
     * the first cut of this rule reporting that shape was the corpus doctrine
     * firing: it named a reviewed, working port. What the measured incidents
     * (abap-check §5: app 352's live TABLE_INVALID_INDEX 500, filter_itab's
     * wrong-table index) share is a CLOBBERED sy-tabix — an inner READ TABLE,
     * an inner LOOP that ended, or a DO between the loop header and the DELETE.
     * So the rule fires on exactly two shapes: the delete names an ENCLOSING
     * loop's table while an inner loop is open (sy-tabix belongs to the inner
     * one), or a clobbering statement sits lexically between the owning loop's
     * header and the delete. Lexical order is the right model per iteration:
     * the loop header re-sets sy-tabix on every pass, so only a clobberer
     * BEFORE the delete in the body runs before it each time around. */
    {
      const events = [];
      for (const m of blank.matchAll(/\bLOOP\s+AT\s+(?:me->)?([a-z_][\w\/]*)/gi)) {
        events.push({ at: m.index, kind: 'open', name: m[1].toLowerCase() });
      }
      for (const m of blank.matchAll(/\bENDLOOP\b/gi)) events.push({ at: m.index, kind: 'close' });
      // an ENDMETHOD closes whatever a broken source left open — the corpus
      // lesson about dispatch leaking across method boundaries
      for (const m of blank.matchAll(/\bENDMETHOD\b/gi)) events.push({ at: m.index, kind: 'reset' });
      // the sy-tabix clobberers the incidents were made of: READ TABLE writes
      // it outright, a completed inner LOOP leaves it 0, and ENDDO stands in
      // for the DO construct §5 names between the LOOP and the DELETE. The
      // kernel restores the enclosing loop's cursor at ENDLOOP and DO never
      // touches sy-tabix - the transpiler runtime the same source also runs on
      // does neither, which is what filter_itab and app-352 dumped on; the rule
      // doc says so, so a kernel-only reader knows why the shape is reported
      for (const m of blank.matchAll(/\bREAD\s+TABLE\b/gi)) events.push({ at: m.index, kind: 'clobber' });
      for (const m of blank.matchAll(/\bENDDO\b/gi)) events.push({ at: m.index, kind: 'clobber' });
      for (const m of blank.matchAll(/\bDELETE\s+(?:me->)?([a-z_][\w\/]*)\s+INDEX\s+sy-tabix\b/gi)) {
        events.push({ at: m.index, kind: 'delete', name: m[1].toLowerCase() });
      }
      events.sort((a, b) => a.at - b.at);
      const stack = [];
      for (const e of events) {
        if (e.kind === 'open') stack.push({ name: e.name, clobbered: false });
        else if (e.kind === 'close') {
          stack.pop();
          // the inner loop's ENDLOOP leaves sy-tabix 0 on the transpiler runtime
          for (const f of stack) f.clobbered = true;
        } else if (e.kind === 'clobber') {
          for (const f of stack) f.clobbered = true;
        } else if (e.kind === 'reset') stack.length = 0;
        else if (e.kind === 'delete') {
          const top = stack[stack.length - 1];
          const owns = stack.some((f) => f.name === e.name);
          if (!owns) continue;
          // the innermost loop's own, unclobbered cursor deletes the current
          // row - the kernel and the transpiler runtime both adjust for that
          if (top.name === e.name && top.clobbered === false) continue;
          // dedupe = offset: two deletes on the same table are two call sites
          report({ member: e.name, dedupe: String(e.at), offset: e.at });
        }
      }
    }
  },
});
