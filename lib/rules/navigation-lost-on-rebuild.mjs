import { defineRule } from '../rule.mjs';
import { displayPathMethods, methodSpans } from '../abap-source.mjs';

/** The attribute names `_bind*( )` reaches anywhere in the class (the root
 *  of the bound name, lower case): the class state a binding writes back. */
function boundFieldNames(src) {
  const out = new Set();
  for (const m of src.matchAll(/_bind(?:_edit|_path)?\s*\(\s*(?:val\s*=\s*)?(?:me->)?(\w+)/gi)) out.add(m[1].toLowerCase());
  return out;
}

/** Whether `body` assigns one of the two names from the other. */
function copies(body, a, b) {
  const one = (x, y) => new RegExp(`(?:^|[.\\s])(?:me->)?${x}\\s*=\\s*(?:me->)?${y}\\s*\\.`, 'im').test(body);
  return one(a, b) || one(b, a);
}

/** The literal values a field is given: its declaration's `VALUE` and every
 *  `field = \`…\`.` assignment. */
function literalsOf(src, field) {
  const out = [];
  for (const m of src.matchAll(new RegExp(`\\b(?:DATA|CLASS-DATA)\\s+${field}\\s+TYPE\\b[^.]*?\\bVALUE\\s+[\`']([^\`']*)[\`']`, 'gi'))) out.push(m[1]);
  for (const m of src.matchAll(new RegExp(`(?:^|[.\\s])(?:me->)?${field}\\s*=\\s*[\`']([^\`']*)[\`']\\s*\\.`, 'gim'))) out.push(m[1]);
  return out;
}

/* Judged once per class, after checkFrontendWires( ) has collected the
 * navigation calls (`navWires`). */
function check({ containerPages, navWires, src, report }) {
  /* navigation-lost-on-rebuild: the half of the rebuild-survival question the
   * `^set…` collector leaves out on purpose (its comment says why). A
   * container's position - the NavContainer's current page, the SplitApp's
   * detail, the FlexibleColumnLayout's column - is live control state: the
   * rebuild brings the container back on its initial page. That is a defect
   * only where the class KEEPS the position in a bound field, which survives
   * and then names a page the user no longer sees (samples-controls app 585:
   * the SideNavigation highlights `root2` over `page2`). So a navigation call
   * issued off the display path is reported when a bound field names a page
   * of that container, which the class says in one of three ways:
   *
   *   (a) the call navigates to the field itself - `( selectedkey )`;
   *   (b) the method that issues it copies the call's target into the field,
   *       or the field into the target - `selectedkey = key.` then `( key )`;
   *   (c) a literal the field holds - its declaration's VALUE or a literal
   *       assignment - is the id of one of the container's pages.
   *
   * What it must NOT read as a page: a non-literal target by itself (apps 096
   * and 242 navigate to `get_event_arg( )` while keeping a bound SplitApp
   * mode and a transition - correct, nothing names a page), and a stack-
   * relative call (`back`, `navigateBack`: the rebuild empties the stack, so
   * re-issuing one is meaningless - not in NAV_TO). The remedy is keyed on the
   * CONTAINER, not on the call: a display-path method that navigates the same
   * container in any way (585 re-issues `to( selectedkey )` where its handler
   * sends `to( key )`) silences every wire on it. A popup's method counts as
   * the display path, as for the setters. */
  if (!navWires.length) return;
  const onDisplayPath = displayPathMethods(src);
  const spans = methodSpans(src);
  const spanOf = (at) => spans.find((s) => at >= s.from && at < s.to) ?? null;
  const reissued = new Set();
  for (const w of navWires) {
    w.span = spanOf(w.offset);
    if (w.span && onDisplayPath.has(w.span.name)) reissued.add(w.id);
  }
  const bound = boundFieldNames(src);
  // a field's literals are read once, not once per wire that asks (c)
  const literalsByField = new Map();
  const literals = (f) => {
    if (!literalsByField.has(f)) literalsByField.set(f, literalsOf(src, f));
    return literalsByField.get(f);
  };
  for (const w of navWires) {
    if (!w.span || onDisplayPath.has(w.span.name) || reissued.has(w.id)) continue;
    const targetName = w.target.value === null ? w.target.text.match(/^(?:me->)?(\w+)$/i)?.[1]?.toLowerCase() : null;
    const pages = new Set(containerPages?.[w.id] ?? []);
    const body = src.slice(w.span.from, w.span.to);
    const field = [...bound].find((f) => {
      if (targetName === f) return true;                                   // (a)
      if (targetName && copies(body, f, targetName)) return true;          // (b)
      return pages.size > 0 && literals(f).some((v) => pages.has(v));      // (c)
    });
    if (!field) continue;
    report({ control: 'CONTROL_BY_ID', member: w.call, value: w.id, field, offset: w.offset });
  }
}

export default defineRule({
  id: 'navigation-lost-on-rebuild',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a container navigated only from a handler while a bound field keeps the page — the rebuild shows another',
  detail: 'The twin of `control-state-lost-on-rebuild` for the calls that are no setters: `to`, `backToPage`, `toDetail`, `toMaster` on a NavContainer, a SplitApp or a FlexibleColumnLayout. A container\'s current page is live control state — `view_display( )` destroys the slot and `XMLView.create` builds the container afresh on its `initialPage` — while a two-way bound field is class state and survives. A class that navigates from an event handler and KEEPS the position in such a field therefore contradicts itself after every rebuild (a draft restore, a called app handing control back, any later `view_display( )`): the field still names the page the user navigated to, the container shows the first one, and whatever reads the field — a SideNavigation\'s `selectedKey`, a breadcrumb — tells the user something that is not on screen (samples-controls app 585). Reported when a bound field names a page of that container: the call navigates to the field itself, the method that issues it copies its target into the field (or the field into the target), or a literal the field holds is the id of one of the container\'s pages. A non-literal target alone is not enough — a call to `get_event_arg( )` next to a bound SplitApp mode is correct — and the stack-relative calls (`back`, `navigateBack`) are not judged, since a rebuild empties the stack they move along. Any navigation of the SAME container from a method on the display path silences every wire on it: re-issuing `to( selectedkey )` there, guarded by the field, is the remedy, whatever argument the handler sends. A method that displays a popup counts as the display path.',
  example: `PUBLIC SECTION.
  DATA selectedkey TYPE string.
METHOD view_display.
  view->tag( \`Select\` )->a( n = \`selectedKey\` v = client->_bind( selectedkey ) ).
  client->view_display( view->stringify( ) ).
ENDMETHOD.
METHOD on_event.
  selectedkey = client->get_event_arg( ).   " the page the user picked
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`pageContainer\` ) ( \`to\` ) ( selectedkey ) ) ).
ENDMETHOD.`,
  remedy: `PUBLIC SECTION.
  DATA selectedkey TYPE string.
METHOD view_display.
  view->tag( \`Select\` )->a( n = \`selectedKey\` v = client->_bind( selectedkey ) ).
  client->view_display( view->stringify( ) ).
  IF selectedkey IS NOT INITIAL.   " the rebuilt container starts on its initialPage
    client->follow_up_action( val   = client->cs_event-control_by_id
                              t_arg = VALUE #( ( \`pageContainer\` ) ( \`to\` ) ( selectedkey ) ) ).
  ENDIF.
ENDMETHOD.
METHOD on_event.
  selectedkey = client->get_event_arg( ).
  client->follow_up_action( val   = client->cs_event-control_by_id
                            t_arg = VALUE #( ( \`pageContainer\` ) ( \`to\` ) ( selectedkey ) ) ).
ENDMETHOD.`,
  message: (f) => `${f.member}( ) moves '${f.value}' only from a handler off the display path, while the bound field ${f.field} keeps the page it moved to — view_display( ) rebuilds the container on its initial page, the field survives, and the view then shows one page while ${f.field} names another. Re-issue the navigation from the method that displays the view, guarded by ${f.field}`,
  check,
});
