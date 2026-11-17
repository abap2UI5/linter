import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'undefined-css-class',
  summary: 'a `class` token neither UI5 nor a `<style>` block in the view defines',
  detail: 'A `class` attribute adds the token to the control\'s root DOM element, and something has to define it: UI5\'s own stylesheets (every token under the harvested prefixes in `lib/css-classes.mjs` — `sapUi…`, `sapM…`, `sapF…`, `sapUxAP…`, `sapTnt…`, `sapTheme…`, `sapContrast…`), or a `<style>` block the same document injects through a `core:HTML` content attribute. A token that is neither styles nothing — the classic trace of a ported sample whose CSS file was not ported with it. Reported when the document carries no style block at all, or carries one that defines other tokens. A document whose stylesheet the reconstructor could not follow (assembled at runtime) is not judged. A hint, because CSS can be shipped from outside the class — a served stylesheet, a custom theme — and the view has no way of saying so; a repo that does that switches the rule off.',
  example: 'view->tag( `Panel` )->a( n = `class` v = `sapUiSmallMargin demoBox` )   " no <style> in the view defines .demoBox',
  remedy: 'view->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<style>.demoBox \\{ padding: 1rem \\}</style>` )->tag( `Panel` )->a( n = `class` v = `sapUiSmallMargin demoBox` )',
});
