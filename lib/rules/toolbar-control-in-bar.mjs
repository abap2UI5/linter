import { defineRule } from '../rule.mjs';
import { TOOLBAR_ONLY, lt } from '../ui5-meta.mjs';

function check({ floor, full, minUi5, node, ownerControl, report }) {
  /* A toolbar-only control inside a sap.m.Bar. Everything in the view
   * exists on the target release and it still renders wrong, because
   * only the CSS changed: ToolbarSpacer and ToolbarSeparator render a
   * <div> and are laid out as intended only inside a Toolbar, which is
   * a flex container. A Bar is not, before 1.76 - .sapMBarLeft /
   * .sapMBarRight were position:absolute + text-align with the children
   * in NORMAL FLOW, where a block-level child starts a new line, and
   * .sapMBarContainer{overflow:hidden} at the bar's 3rem height cuts
   * away everything from that line on. So the separator does not draw a
   * rule between two groups of icons: it deletes every icon after it.
   *
   * Bar and Toolbar are unrelated classes (both merely implement
   * sap.m.IBar), so the test is exact rather than an inheritance walk
   * that could reach a Toolbar. Page headerContent is the second half:
   * it is FORWARDED into the internal Bar's contentRight, which is how
   * this reaches a view that never writes a <Bar> at all. */
  if (TOOLBAR_ONLY.has(full) && lt(floor, [1, 76]) && ownerControl) {
    const inBar = ownerControl.control === 'sap.m.Bar';
    const forwarded = ownerControl.control === 'sap.m.Page'
      && ownerControl.aggregation === 'headerContent';
    if (inBar || forwarded) {
      report({
        control: full,
        member: forwarded
          ? 'sap.m.Page headerContent, which is forwarded into the internal sap.m.Bar'
          : `sap.m.Bar ${ownerControl.aggregation || '(default aggregation)'}`,
        minUi5,
        offset: node.offset,
      });
    }
  }

}

export default defineRule({
  id: 'toolbar-control-in-bar',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: '`ToolbarSpacer`/`ToolbarSeparator` inside a `sap.m.Bar`',
  detail: 'The nastiest kind of version defect: every control and every property in the view exists on the target release, and it still renders wrong — only the CSS changed. `ToolbarSpacer` and `ToolbarSeparator` render a `<div>` and are laid out as intended only inside a `sap.m.Toolbar`, which is a flex container. `sap.m.Bar` is not, before 1.76: `.sapMBarLeft`/`.sapMBarRight` were `position: absolute` + `text-align` with the children in normal flow, where a block-level child **starts a new line** — and `.sapMBarContainer { overflow: hidden }` at the bar\'s 3rem height cuts away everything from that line on. So a separator between two groups of icons does not draw a rule: it **deletes every icon after it**, without a word. And a `Bar` is rarely written on purpose — `sap.m.Page` `headerContent` is forwarded into the internal Bar\'s `contentRight`, which is how this reached three overview headers at once. The fix is not a different separator, it is no separator: put only inline controls in a bar and express the grouping with a margin class (`sapUiMediumMarginBegin` on the first control of the next group). Reported only for a target below 1.76.',
  example: 'view->ele( `headerContent` )->tag( `ToolbarSeparator` )',
  remedy: `view->ele( \`headerContent\`
    )->tag( \`Button\`
    )->tag( \`Button\`
        )->a( n = \`class\` v = \`sapUiMediumMarginBegin\` )`,
  message: (f) => `${f.control} is a block-level control inside ${f.member} — before UI5 1.76 a sap.m.Bar lays its children out in normal flow, so it starts a new line and the bar's overflow:hidden CUTS AWAY every sibling after it; express the grouping with a margin class (sapUiMediumMarginBegin) instead`,
  check,
});
