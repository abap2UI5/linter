/*
 * Whether a piece of work grows linearly with its input - the one timing
 * question the suite asks, asked in a way a loaded CI runner cannot fail.
 *
 * Wall clock on a shared runner is noise: a GC pause, a neighbour job, a
 * worker of the same suite. So nothing is compared against a fixed number of
 * milliseconds alone. The work runs at n and at 4n, each the best of three
 * tries (noise only ever adds time), and the ratio is judged: linear work
 * takes about 4x, quadratic about 16x, and the bound sits at 10x between
 * them. The smaller time is floored at `floorMs` - a 2 ms run that becomes
 * 25 ms under load is not a quadratic algorithm - so the input has to be
 * large enough for the quadratic version to take a while at 4n (choose n so
 * the old code took a second or more there).
 */
export function bestOf(work, tries = 3) {
  let best = Infinity;
  for (let i = 0; i < tries; i++) {
    const t = performance.now();
    work();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

/** { ok, small, big } for `run(make(n))` against `run(make(4 * n))`. */
export function scalesLinearly(make, run, n, { floorMs = 25, bound = 10 } = {}) {
  const smallInput = make(n);
  const bigInput = make(4 * n);
  run(smallInput); // warm: the first call pays for compiling the code
  const small = bestOf(() => run(smallInput));
  const big = bestOf(() => run(bigInput));
  return { ok: big < Math.max(small, floorMs) * bound, small: Math.round(small), big: Math.round(big) };
}
