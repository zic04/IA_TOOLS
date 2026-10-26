// How the ReDoS harness measures the growth of a scanner (test/tools/redos-worker.mjs, RULES.md S5): its slowest
// inputs built again 4, then 16 times longer, each size's time against the size below. Pure: the clock and the heap
// are given, so that a test can play a fast machine. A step is trusted from MEASURABLE_MS on (the security test's
// floor); one that is shorter and may hide a quadratic growth — it looks quadratic, or the size below was too fast to
// measure, so its ratio is a bound, not a measure — is measured again 4 times longer, up to MAX_TIMES the base size:
// on a fast machine a quadratic scanner (the canary, 10 ms at 16 times on GitHub's Linux runners) would otherwise stay
// under the floor and pass unseen. A scanner whose steps stay under SUSPECT, measured, stops at 16 times, as before.
// Each run is timed in a clean heap (cleanRun): the young generation collected before it, the collector's pauses
// inside it taken out of its time — the collector's work starts at one size and not the size below, and is not the
// scanner's growth. A step that looks quadratic is measured again, the two sizes in turn; one that would fail, longer.
// Limit: a ratio shows only the part of the time that grows — a scanner whose linear part outweighs its quadratic
// part at every size measured is not seen (SECURITY.md).
import v8 from "node:v8";
import vm from "node:vm";

/**
 * A step that looks quadratic: 4 times the input, more than SUSPECT times the time. Measured again, AGAIN runs of each
 * size in turn; one that would fail (GROWTH_RATIO), CONFIRM runs of each more before it does, and on until those runs
 * have taken CONFIRM_MS (MAX_CONFIRM at most): a stall of the machine (a file read held back for half a second, the
 * reads before and after it fast) is over by then; a real growth is not.
 */
const SUSPECT = 6;
const AGAIN = 5;
const CONFIRM = 10;
const CONFIRM_MS = 2000;
const MAX_CONFIRM = 200;
/** Under this time (ms) a run is noise: a ratio against it is a bound, not a measure. */
const FLOOR_MS = 0.05;
/** The time from which a step's ratio is trusted (ms). */
export const MEASURABLE_MS = 20;
/** The longest input a growth is measured on, in times the base size. */
const MAX_TIMES = 256;
/** What the tests call quadratic: a trusted step (MEASURABLE_MS or longer) this many times slower for 4 times. */
export const GROWTH_RATIO = 8;

/** @type {((options?: { type: string }) => void) | undefined} */
let collector;
/**
 * Collects the young generation (a scavenge, a few milliseconds): what earlier runs left there is not copied during the
 * next one. Not the whole heap: a full collection takes 80 ms on a heap of 200 MB, the sweeping it leaves behind made
 * the next run 30 % slower, and on a busy machine the growth files failed four times as often with it as without.
 * Node gives `gc` to a process started with --expose-gc only: the flag set at run time gives it to a new context,
 * whose `gc` collects the heap of the whole thread, a worker's too (Node 20, 22 and 24). Found once; a Node that gives
 * none fails the measure rather than measuring without it.
 */
export function collectGarbage() {
  if (!collector) {
    if (typeof globalThis.gc === "function")
      collector = /** @type {(options?: { type: string }) => void} */ (globalThis.gc);
    else {
      v8.setFlagsFromString("--expose-gc");
      const gc = vm.runInNewContext("typeof gc === 'function' ? gc : undefined");
      if (typeof gc !== "function") throw new Error("test/tools/growth.mjs: this Node gives no garbage collector");
      collector = gc;
    }
  }
  collector({ type: "minor" });
}

/**
 * One timed run in a clean heap. The young generation is collected first, outside the time: a scavenge owed to what ran
 * before does not fall in one size's runs and not in the size below's. Then the pauses of the collector inside the run
 * (v8.GCProfiler), a pass over the old generation's included, are taken out of its time: a reader that keeps an object
 * a character fills the young generation at one size and not the size below, and the scavenges that copy what it keeps
 * cost more than the reading (×8 to ×11 for 4 times the input, measured with them; ×4 without). Linear readers took ×9
 * to ×18 that way on loaded runners, at 1 to 130 ms, each time another one. The collector works in proportion to what
 * the run allocates, which the run's own time pays for as well: a reader quadratic in what it allocates or keeps stays
 * quadratic without the pauses (test/unit/harness-growth.test.mjs).
 * @param {() => number} measure   the run, timed: its time (ms)
 * @returns {number} that time less the collector's pauses during it (ms)
 */
export function cleanRun(measure) {
  collectGarbage();
  const profiler = new v8.GCProfiler();
  profiler.start();
  const ms = measure();
  const paused = profiler.stop().statistics.reduce((sum, s) => sum + s.cost, 0) / 1000; // cost: µs
  return Math.max(0, ms - paused);
}

/**
 * @param {(s: string) => unknown} fn             the scanner
 * @param {number[]} times                          its time on each input of the base size
 * @param {object} p
 * @param {Array<[string, string]>} p.shapes        the prefix and the unit of each built input (the first ones)
 * @param {string[]} p.inputs                       the inputs of the base size (the built ones first)
 * @param {number} p.size                           the base size
 * @param {(prefix: string, unit: string, n: number) => string} p.build   an input of about n characters
 * @param {(fn: (s: string) => unknown, input: string) => number} p.time  one run's time (ms)
 * @param {(measure: () => number) => number} [p.clean]  how each run is timed: cleanRun (a test plays it)
 * @returns {Array<{ ratio: number, ms: number, input: string }>}
 */
export function growthOf(fn, times, { shapes, inputs, size, build, time, clean = cleanRun }) {
  const once = (input) => clean(() => time(fn, input));
  /** The best of two runs: a pause of the machine during one of them is not taken for growth. */
  const best = (input) => Math.min(once(input), once(input));
  const order = times.map((ms, i) => i).sort((a, b) => times[b] - times[a]);
  const steps = [];
  for (const i of order.slice(0, 3).filter((k) => k < shapes.length)) {
    const [p, u] = shapes[i];
    let shorter = inputs[i];
    let before = times[i];
    for (let n = 4 * size; n <= MAX_TIMES * size; n *= 4) {
      const long = build(p, u, n);
      let ms = best(long);
      const ratio = () => ms / Math.max(before, FLOOR_MS);
      // A step that looks quadratic is measured again, a run of each size in turn, the better of each kept: a busy
      // spell of the machine slows both sizes, or does not come back the same way every time; a real growth does.
      // One that would fail is measured again longer before it does.
      const again = (runs, spend = 0) => {
        let spent = 0;
        for (let k = 0; k < runs || (spent < spend && k < MAX_CONFIRM); k++) {
          const [a, b] = [once(shorter), once(long)];
          spent += a + b;
          before = Math.min(before, a);
          ms = Math.min(ms, b);
        }
      };
      if (ratio() > SUSPECT) again(AGAIN);
      if (ms >= MEASURABLE_MS && ratio() > GROWTH_RATIO) again(CONFIRM, CONFIRM_MS);
      const step = { ratio: ratio(), ms, input: long.slice(0, 60) };
      steps.push(step);
      // Still too slow, measured again: the scanner fails, whatever its other inputs do.
      if (ms >= MEASURABLE_MS && step.ratio > GROWTH_RATIO) return steps;
      const hidden = step.ms < MEASURABLE_MS && (step.ratio > SUSPECT || before < FLOOR_MS);
      before = ms;
      shorter = long;
      // 4 and 16 times always; beyond, only while a step too short to be trusted may hide a quadratic growth.
      if (n >= 16 * size && !hidden) break;
    }
  }
  return steps;
}

/**
 * Asserts a reader of whole files stays linear on a crafted shape (RULES.md S5): built at `size`, then 4 and 16 times
 * larger — larger still while a step is too short to be trusted —, the best of several runs each, each in a clean heap
 * (growthOf, cleanRun). `build(n)` returns the input of about n units (a folder written for it, say), `run(input)`
 * reads it, `cleanup(input)` removes what build wrote — as soon as the measure is past it: an input is measured with
 * the next size only, so that the inputs of every size are never held at once. Fails, naming the shape, on a trusted
 * step more than GROWTH_RATIO times slower for 4 times.
 * @param {string} label
 * @param {{ build: (n: number) => string, run: (input: string) => unknown, size: number,
 *   cleanup?: (input: string) => void, clock?: () => number, clean?: (measure: () => number) => number }} p
 */
export function assertLinear(
  label,
  { build, run, size, cleanup = () => {}, clock = () => performance.now(), clean = cleanRun },
) {
  /** The inputs built and not yet removed, with their size. */
  let made = [];
  const make = (n) => {
    // The measure of n compares it with n / 4 only: what is smaller is removed now, and no longer held.
    for (const [m, input] of made) if (m < n / 4) cleanup(input);
    made = made.filter(([m]) => m >= n / 4);
    const input = build(n);
    made.push([n, input]);
    return input;
  };
  const time = (fn, input) => {
    const t0 = clock();
    fn(input);
    return clock() - t0;
  };
  try {
    const base = make(size);
    const once = () => clean(() => time(run, base));
    const steps = growthOf(run, [Math.min(once(), once())], {
      shapes: [["", ""]],
      inputs: [base],
      size,
      build: (p, u, n) => make(n),
      time,
      clean,
    });
    const bad = steps.find((s) => s.ms >= MEASURABLE_MS && s.ratio > GROWTH_RATIO);
    if (bad)
      throw new Error(
        `${label}: not linear — ${steps.map((s) => `×${s.ratio.toFixed(1)} (${s.ms.toFixed(0)} ms)`).join(", ")}`,
      );
    return steps;
  } finally {
    for (const [, input] of made) cleanup(input);
  }
}

/**
 * assertLinear for a reader whose input is not a string (files, a list, a document), and which gives something back
 * worth checking: `make(n)` builds the input of size n, `read(input)` reads it (it may assert on what it reads),
 * `remove(input)` removes what `make` wrote. Fails as assertLinear does, and also when the measure never reached 16
 * times `size` (a reader that gives up early would be "linear" by doing nothing).
 * @template I, O
 * @param {string} label
 * @param {{ size: number, make: (n: number) => I, read: (input: I) => O, remove?: (input: I) => void,
 *   clock?: () => number, clean?: (measure: () => number) => number }} p
 * @returns {{ n: number, found: O, at16: O }} the size measured last and what the reader read there; what it read
 *   at 16 times `size`, where the shapes of the tests are meant to be checked
 */
export function linearAt(label, { size, make, read, remove = () => {}, clock, clean }) {
  // What the reader read at 16 times `size` and at the largest size so far: no other size's output is held.
  /** @type {O | undefined} */
  let at16;
  let last = { n: 0, found: /** @type {O | undefined} */ (undefined) };
  const made = new Map(); // assertLinear wants a string per input: its key here
  assertLinear(label, {
    size,
    clock,
    clean,
    build: (n) => {
      const key = `n=${n}`;
      made.set(key, { n, input: make(n) });
      return key;
    },
    run: (key) => {
      const { n, input } = made.get(key);
      const found = read(input);
      if (n === 16 * size) at16 = found;
      if (n >= last.n) last = { n, found };
    },
    cleanup: (key) => {
      remove(made.get(key).input);
      made.delete(key);
    },
  });
  if (last.n < 16 * size) throw new Error(`${label}: measured up to ${last.n}, 16 times ${size} at least`);
  return { n: last.n, found: /** @type {O} */ (last.found), at16: /** @type {O} */ (at16) };
}
