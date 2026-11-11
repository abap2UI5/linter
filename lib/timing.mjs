/*
 * timing - where a check spends its time, for `--timing`.
 *
 * Every rule is one unit (lib/rules/) and is timed on its own, under
 * `rule:<id>`, where it runs with the run's timings - the property walk
 * runs a few untimed, inside `properties`. What is not a rule has its own
 * entry: the reconstruction (`reconstruct`), the class model (`abap-model`),
 * the property walk itself (`properties`, its rules taken out), the portable
 * check (`portable`), and what checkAbapRules( ) does around its rules -
 * reading wires, chains, the class - as `pass:abap-rules (other)`, so the
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
