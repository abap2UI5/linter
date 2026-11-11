/*
 * timing - where a check spends its time, for `--timing`.
 *
 * A rule written as one unit (lib/rules/) is one function and is timed on
 * its own, under `rule:<id>`. The rules still written inside a larger
 * function cannot be: they share its loop and its locals, so the cost of one
 * is not separable from its neighbours'. Those are timed by the module or
 * pass they run in (`pass:<name>`), and what checkAbapRules( ) does outside
 * every named pass is its own entry - `pass:abap-rules (other)` - so the
 * numbers add up and nobody reads a missing rule as a free one.
 *
 * A Map per source; the result carries it as a plain object (`timings`), so
 * it crosses the worker pool's structured clone, and the run adds them up
 * (runStats in report.mjs).
 */

/** Run `fn` and add its wall time to `timings` under `label` - or just run
 *  it when there is no map. */
export function timed(timings, label, fn) {
  if (!timings) return fn();
  const from = performance.now();
  try {
    return fn();
  } finally {
    timings.set(label, (timings.get(label) ?? 0) + performance.now() - from);
  }
}
