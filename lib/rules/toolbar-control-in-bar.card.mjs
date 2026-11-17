import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'toolbar-control-in-bar',
  summary: '`ToolbarSpacer`/`ToolbarSeparator` inside a `sap.m.Bar`',
  detail: 'The nastiest kind of version defect: every control and every property in the view exists on the target release, and it still renders wrong — only the CSS changed. `ToolbarSpacer` and `ToolbarSeparator` render a `<div>` and are laid out as intended only inside a `sap.m.Toolbar`, which is a flex container. `sap.m.Bar` is not, before 1.76: `.sapMBarLeft`/`.sapMBarRight` were `position: absolute` + `text-align` with the children in normal flow, where a block-level child **starts a new line** — and `.sapMBarContainer { overflow: hidden }` at the bar\'s 3rem height cuts away everything from that line on. So a separator between two groups of icons does not draw a rule: it **deletes every icon after it**, without a word. And a `Bar` is rarely written on purpose — `sap.m.Page` `headerContent` is forwarded into the internal Bar\'s `contentRight`, which is how this reached three overview headers at once. The fix is not a different separator, it is no separator: put only inline controls in a bar and express the grouping with a margin class (`sapUiMediumMarginBegin` on the first control of the next group). Reported only for a target below 1.76.',
  example: 'view->ele( `headerContent` )->tag( `ToolbarSeparator` )',
  remedy: `view->ele( \`headerContent\`
    )->tag( \`Button\`
    )->tag( \`Button\`
        )->a( n = \`class\` v = \`sapUiMediumMarginBegin\` )`,
});
