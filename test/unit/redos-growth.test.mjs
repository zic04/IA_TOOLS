// How the ReDoS harness measures a scanner's growth (test/tools/growth.mjs), on a clock the test plays: a machine
// fast enough that a quadratic scanner takes only 10 ms at 16 times the base size — what GitHub's Linux runners did
// to the canary in 0.4.0, which passed under the trusted floor and failed the security test there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { growthOf, MEASURABLE_MS, assertLinear } from "../tools/growth.mjs";

const SIZE = 3000;
/** The growth of a scanner whose time is `model(length, run)` ms (run: how many times that length was timed). */
function measure(model) {
  const build = (p, u, n) => p + u.repeat(n);
  const inputs = [build("p", "a", SIZE)];
  const runs = new Map();
  const time = (fn, input) => {
    runs.set(input.length, (runs.get(input.length) ?? 0) + 1);
    return model(input.length, runs.get(input.length));
  };
  return growthOf(() => {}, [time(null, inputs[0])], { shapes: [["p", "a"]], inputs, size: SIZE, build, time });
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
