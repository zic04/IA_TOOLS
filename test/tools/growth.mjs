// How the ReDoS harness measures the growth of a scanner (test/tools/redos-worker.mjs, RULES.md S5): its slowest
// inputs built again 4, then 16 times longer, each size's time against the size below. Pure: the clock is given, so
// that a test can play a fast machine. A step is trusted from MEASURABLE_MS on (the security test's floor); one that
// is shorter and may hide a quadratic growth — it looks quadratic, or the size below was too fast to measure, so its
// ratio is a bound, not a measure — is measured again 4 times longer, up to MAX_TIMES the base size: on a fast
// machine a quadratic scanner (the canary, 10 ms at 16 times on GitHub's Linux runners) would otherwise stay under
// the floor and pass unseen. A scanner whose steps stay under SUSPECT, measured, stops at 16 times, as before.
// Limit: a ratio shows only the part of the time that grows — a scanner whose linear part outweighs its quadratic
// part at every size measured is not seen (SECURITY.md).

/** A step that looks quadratic: 4 times the input, more than SUSPECT times the time. Measured again, AGAIN runs. */
const SUSPECT = 6;
const AGAIN = 5;
/** Under this time (ms) a run is noise: a ratio against it is a bound, not a measure. */
const FLOOR_MS = 0.05;
/** The time from which a step's ratio is trusted (ms). */
export const MEASURABLE_MS = 20;
/** The longest input a growth is measured on, in times the base size. */
const MAX_TIMES = 256;

/**
 * @param {(s: string) => unknown} fn             the scanner
 * @param {number[]} times                          its time on each input of the base size
 * @param {object} p
 * @param {Array<[string, string]>} p.shapes        the prefix and the unit of each built input (the first ones)
 * @param {string[]} p.inputs                       the inputs of the base size (the built ones first)
 * @param {number} p.size                           the base size
 * @param {(prefix: string, unit: string, n: number) => string} p.build   an input of about n characters
 * @param {(fn: (s: string) => unknown, input: string) => number} p.time  one run's time (ms)
 * @returns {Array<{ ratio: number, ms: number, input: string }>}
 */
export function growthOf(fn, times, { shapes, inputs, size, build, time }) {
  /** The best of `runs` runs: a pause of the collector during one of them is not taken for growth. */
  const best = (input, runs = 2) => Math.min(...Array.from({ length: runs }, () => time(fn, input)));
  const order = times.map((ms, i) => i).sort((a, b) => times[b] - times[a]);
  const steps = [];
  for (const i of order.slice(0, 3).filter((k) => k < shapes.length)) {
    const [p, u] = shapes[i];
    let shorter = inputs[i];
    let before = times[i];
    for (let n = 4 * size; n <= MAX_TIMES * size; n *= 4) {
      const long = build(p, u, n);
      let ms = best(long);
      // A step that looks quadratic is measured again, both sizes, the better of each kept: a pause of the
      // collector or a busy machine does not come back the same way twice, a real growth does.
      if (ms / Math.max(before, FLOOR_MS) > SUSPECT) {
        before = Math.min(before, best(shorter, AGAIN));
        ms = Math.min(ms, best(long, AGAIN));
      }
      const step = { ratio: ms / Math.max(before, FLOOR_MS), ms, input: long.slice(0, 60) };
      steps.push(step);
      const hidden = step.ms < MEASURABLE_MS && (step.ratio > SUSPECT || before < FLOOR_MS);
      before = ms;
      shorter = long;
      // 4 and 16 times always; beyond, only while a step too short to be trusted may hide a quadratic growth.
      if (n >= 16 * size && !hidden) break;
    }
  }
  return steps;
}

/** What the tests call quadratic: a trusted step (MEASURABLE_MS or longer) this many times slower for 4 times. */
export const GROWTH_RATIO = 8;

/**
 * Asserts a reader of whole files stays linear on a crafted shape (RULES.md S5): built at `size`, then 4 and 16 times
 * larger — larger still while a step is too short to be trusted —, the best of several runs each (growthOf). `build(n)`
 * returns the input of about n units (a folder written for it, say), `run(input)` reads it, `cleanup(input)` removes
 * what build wrote. Fails, naming the shape, on a trusted step more than GROWTH_RATIO times slower for 4 times.
 * @param {string} label
 * @param {{ build: (n: number) => string, run: (input: string) => unknown, size: number,
 *   cleanup?: (input: string) => void, clock?: () => number }} p
 */
export function assertLinear(label, { build, run, size, cleanup = () => {}, clock = () => performance.now() }) {
  const made = [];
  const make = (n) => {
    const input = build(n);
    made.push(input);
    return input;
  };
  const time = (fn, input) => {
    const t0 = clock();
    fn(input);
    return clock() - t0;
  };
  try {
    const base = make(size);
    const steps = growthOf(run, [Math.min(time(run, base), time(run, base))], {
      shapes: [["", ""]],
      inputs: [base],
      size,
      build: (p, u, n) => make(n),
      time,
    });
    const bad = steps.find((s) => s.ms >= MEASURABLE_MS && s.ratio > GROWTH_RATIO);
    if (bad)
      throw new Error(
        `${label}: not linear — ${steps.map((s) => `×${s.ratio.toFixed(1)} (${s.ms.toFixed(0)} ms)`).join(", ")}`,
      );
    return steps;
  } finally {
    for (const input of made) cleanup(input);
  }
}
