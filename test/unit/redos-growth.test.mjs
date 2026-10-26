// How the ReDoS harness measures a scanner's growth (test/tools/growth.mjs), on a clock the test plays: a machine
// fast enough that a quadratic scanner takes only 10 ms at 16 times the base size — what GitHub's Linux runners did
// to the canary in 0.4.0, which passed under the trusted floor and failed the security test there. The heap is
// played too: each run is timed as it is (played), not in a heap collected first (cleanRun, harness-growth.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { growthOf, MEASURABLE_MS, assertLinear, linearAt } from "../tools/growth.mjs";

const SIZE = 3000;
/** A clean run on a played clock: the run's time as it is. */
const played = (measure) => measure();
/** The growth of a scanner whose time is `model(length, run)` ms (run: how many times that length was timed). */
function measure(model) {
  const build = (p, u, n) => p + u.repeat(n);
  const inputs = [build("p", "a", SIZE)];
  const runs = new Map();
  const time = (fn, input) => {
    runs.set(input.length, (runs.get(input.length) ?? 0) + 1);
    return model(input.length, runs.get(input.length));
  };
  return growthOf(() => {}, [time(null, inputs[0])], {
    shapes: [["p", "a"]],
    inputs,
    size: SIZE,
    build,
    time,
    clean: played,
  });
}
/** What the security test calls quadratic: a trusted step more than eight times slower for four times the input. */
const quadratic = (steps) => steps.find((g) => g.ms >= MEASURABLE_MS && g.ratio > 8);
const shown = (steps) => JSON.stringify(steps.map((s) => [+s.ratio.toFixed(1), +s.ms.toFixed(2)]));

test("a quadratic scanner too fast to be trusted at 16 times is measured longer, until it is: it is seen", () => {
  const c = 10 / (16 * SIZE) ** 2; // 10 ms at 16 times the base size
  const steps = measure((n) => c * n * n);
  assert.ok(steps[1].ms < MEASURABLE_MS && steps[1].ratio > 8, "at 16 times: quadratic, but under the floor");
  assert.ok(quadratic(steps), `seen as quadratic: ${shown(steps)}`);
  assert.equal(steps.length, 3, "one more step, 64 times, and no further: it was trusted there");
});

test("a quadratic scanner so fast that its ratio at 16 times is only a bound (under 0.05 ms below): it is seen", () => {
  // 0.29 ms at 16 times, 0.018 ms at 4 times: against the floor of 0.05 ms, 5.8 times — not suspect, yet quadratic.
  const c = 0.29 / (16 * SIZE) ** 2;
  const steps = measure((n) => c * n * n);
  assert.ok(steps[1].ratio < 6, `at 16 times its ratio is a bound: ${shown(steps)}`);
  assert.ok(quadratic(steps), `seen as quadratic: ${shown(steps)}`);
});

test("a scanner whose steps stay under 6 times, measured, stops at 16 times, as before: no longer input", () => {
  const steps = measure((n) => (10 / (16 * SIZE)) * n);
  assert.equal(steps.length, 2);
  assert.ok(!quadratic(steps));
});

test("a linear scanner too fast to measure is measured longer, and never taken for a quadratic one", () => {
  const steps = measure((n) => (0.04 / (16 * SIZE)) * n); // 0.01 ms at 4 times: under the floor
  assert.ok(steps.length > 2 && steps.length <= 4, shown(steps));
  assert.ok(!quadratic(steps), shown(steps));
});

test("a pause during the first runs of one size is measured again: not taken for growth", () => {
  // A linear scanner, 10 ms at 16 times, but its first two runs there 10 times slower (the collector, a busy machine).
  const at16 = 16 * SIZE + 1;
  const steps = measure((n, run) => (10 / (16 * SIZE)) * n * (n === at16 && run <= 2 ? 10 : 1));
  assert.ok(!quadratic(steps), shown(steps));
});

test("a step that would fail is measured again longer before it does: a busy spell over seven runs is not growth", () => {
  // The same scanner, its first seven runs at 16 times 3 times slower: ×12 after the step measured again, 30 ms.
  const at16 = 16 * SIZE + 1;
  const steps = measure((n, run) => (10 / (16 * SIZE)) * n * (n === at16 && run <= 7 ? 3 : 1));
  assert.ok(!quadratic(steps), shown(steps));
  // A stall of the machine over the first thirty runs there (a file read held back): the step is measured on until
  // two seconds of runs have passed, and the stall with them.
  const stalled = measure((n, run) => (10 / (16 * SIZE)) * n * (n === at16 && run <= 30 ? 3 : 1));
  assert.ok(!quadratic(stalled), shown(stalled));
  // A quadratic scanner measured as long stays quadratic: ×16 at every run.
  const c = 30 / (16 * SIZE) ** 2;
  assert.ok(quadratic(measure((n) => c * n * n)));
});

test("a growth that stays suspect but too short to trust stops at the longest input: 256 times, never beyond", () => {
  // 6.2 times slower for 4 times the input at every step, 0.31 ms at 16 times: still under the floor at 256 times.
  const steps = measure((n) => 0.31 * 6.2 ** (Math.log(n / (16 * SIZE)) / Math.log(4)));
  assert.equal(steps.length, 4, "4, 16, 64 and 256 times");
  assert.ok(
    steps.every((s) => s.ms < MEASURABLE_MS),
    "too short to be trusted: the security test reads none",
  );
});

/** A reader whose time is `model(n)` ms on an input of n units, on a played clock; the inputs built and removed. */
function reader(model) {
  let now = 0;
  const built = [];
  const removed = [];
  return {
    built,
    removed,
    p: {
      size: 1000,
      build: (n) => (built.push(String(n)), String(n)),
      run: (input) => void (now += model(Number(input))),
      cleanup: (input) => removed.push(input),
      clock: () => now,
      clean: played,
    },
  };
}

test("assertLinear: a reader quadratic on its shape fails, naming it; every input it built is removed", () => {
  const r = reader((n) => 30 * (n / 1000) ** 2);
  assert.throws(() => assertLinear("a quadratic reader", r.p), /a quadratic reader: not linear/);
  assert.deepEqual([...r.removed].sort(), [...r.built].sort());
});

test("assertLinear: a linear reader passes, its steps returned; one too fast to be trusted passes too", () => {
  assert.ok(assertLinear("linear", reader((n) => 30 * (n / 1000)).p).every((s) => s.ratio < 8));
  assert.ok(assertLinear("fast", reader((n) => 0.001 * (n / 1000)).p).length >= 2);
});

/** linearAt on a played clock: a reader of lists whose time is `model(length)` ms. */
function listReader(model) {
  let now = 0;
  const removed = [];
  const p = {
    size: 100,
    make: (n) => Array.from({ length: n }, (_, i) => i),
    read: (list) => ((now += model(list.length)), list.length),
    remove: (list) => removed.push(list.length),
    clock: () => now,
    clean: played,
  };
  return { p, removed };
}

test("linearAt: inputs that are not strings; a linear reader gives what it read at the largest size, all removed", () => {
  const r = listReader((n) => 30 * (n / 100));
  const { n, found } = linearAt("lists", r.p);
  assert.ok(n >= 16 * 100, `measured up to ${n}`);
  assert.equal(found, n, "what the reader gave on the largest input");
  assert.ok(r.removed.includes(n) && r.removed.includes(100));
});

test("linearAt: a quadratic reader fails, naming its label; an instant one is measured up to 256 times the size", () => {
  assert.throws(
    () => linearAt("quadratic lists", listReader((n) => 30 * (n / 100) ** 2).p),
    /quadratic lists: not linear/,
  );
  assert.equal(linearAt("instant", listReader(() => 0).p).n, 256 * 100);
});

test("growthOf times every run through its clean run, the steps measured again too, and keeps the time it gives", () => {
  const build = (p, u, n) => p + u.repeat(n);
  const inputs = [build("p", "a", SIZE)];
  const c = 10 / (16 * SIZE) ** 2; // quadratic, 10 ms at 16 times: measured again, and longer
  let inClean = false;
  let runs = 0;
  let cleans = 0;
  const time = (fn, input) => {
    assert.ok(inClean, "a run timed outside its clean run");
    runs++;
    return c * input.length ** 2;
  };
  const clean = (measure) => {
    cleans++;
    inClean = true;
    const ms = measure();
    inClean = false;
    return ms;
  };
  const steps = growthOf(() => {}, [c * SIZE ** 2], { shapes: [["p", "a"]], inputs, size: SIZE, build, time, clean });
  assert.ok(quadratic(steps), shown(steps));
  assert.ok(runs > 10 && cleans === runs, `${runs} runs, ${cleans} clean runs`);
  // What the clean run gives is the time: a clean run that halves every time halves every step's.
  const half = growthOf(() => {}, [c * SIZE ** 2], {
    shapes: [["p", "a"]],
    inputs,
    size: SIZE,
    build,
    time: (fn, input) => c * input.length ** 2,
    clean: (measure) => measure() / 2,
  });
  assert.equal(half[0].ms, steps[0].ms / 2);
});

test("assertLinear and linearAt keep the clean run's time: the collector's pauses it takes out are not the reader's", () => {
  // A linear reader, 30 ms a thousand units, whose runs from 16,000 units on hold a pause of the collector twice as
  // long as the reading: ×12 at 16 times, counted. The clean run takes it out; the collection before each run, which
  // takes a second here, is never in the run's time.
  const reader = () => {
    let now = 0;
    let paused = 0;
    let cleans = 0;
    return {
      cleans: () => cleans,
      p: {
        size: 1000,
        clock: () => now,
        build: String,
        run: (input) => {
          const n = Number(input);
          paused = n >= 16_000 ? 60 * (n / 1000) : 0;
          now += 30 * (n / 1000) + paused;
        },
        clean: (measure) => {
          cleans++;
          now += 1000;
          paused = 0;
          return measure() - paused;
        },
      },
    };
  };
  const r = reader();
  const steps = assertLinear("a reader that fills the young generation", r.p);
  assert.deepEqual(
    steps.map((s) => +s.ratio.toFixed(1)),
    [4, 4],
  );
  assert.equal(r.cleans(), 6, "every run through the clean run: the base twice, 4 and 16 times twice each");
  // Its pauses counted, the same reader is taken for a quadratic one: the clean run is what keeps it linear.
  const counted = reader();
  assert.throws(
    () => assertLinear("its pauses counted", { ...counted.p, clean: (measure) => measure() }),
    /its pauses counted: not linear/,
  );
  // linearAt passes it on.
  const lists = reader();
  const { n } = linearAt("lists", {
    size: 1000,
    make: (k) => String(k),
    read: lists.p.run,
    clock: lists.p.clock,
    clean: lists.p.clean,
  });
  assert.equal(n, 16_000);
  assert.equal(lists.cleans(), 6);
});
