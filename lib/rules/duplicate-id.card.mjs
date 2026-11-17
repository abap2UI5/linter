import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'duplicate-id',
  summary: 'the same `id` twice',
  detail: 'A duplicate-ID error at runtime — UI5 IDs are unique per view.',
  example: 'view->tag( `Button` )->a( n = `id` v = `go` )->tag( `Text` )->a( n = `id` v = `go` )',
  remedy: 'view->tag( `Button` )->a( n = `id` v = `go` )->tag( `Text` )->a( n = `id` v = `goLabel` )',
});
