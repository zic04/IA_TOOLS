// How the ReDoS harness measures a scanner's growth (test/tools/growth.mjs), on a clock the test plays: a machine
// fast enough that a quadratic scanner takes only 10 ms at 16 times the base size — what GitHub's Linux runners did
// to the canary in 0.4.0, which passed under the trusted floor and failed the security test there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { growthOf, MEASURABLE_MS, MAX_TIMES } from "../tools/growth.mjs";

const SIZE = 3000;
/** The growth of a scanner whose time is `model(length)` ms, on one built input. */
function measure(model) {
  const build = (p, u, n) => p + u.repeat(n);
  const inputs = [build("p", "a", SIZE)];
  const time = (fn, input) => model(input.length);
  return growthOf(() => {}, [time(null, inputs[0])], { shapes: [["p", "a"]], inputs, size: SIZE, build, time });
}
/** What the security test calls quadratic: a trusted step more than eight times slower for four times the input. */
const quadratic = (steps) => steps.find((g) => g.ms >= MEASURABLE_MS && g.ratio > 8);

test("a quadratic scanner too fast to be trusted at 16 times is measured longer, until it is: it is seen", () => {
  const c = 10 / (16 * SIZE) ** 2; // 10 ms at 16 times the base size
  const steps = measure((n) => c * n * n);
  assert.ok(steps[1].ms < MEASURABLE_MS && steps[1].ratio > 8, "at 16 times: quadratic, but under the floor");
  assert.ok(quadratic(steps), `seen as quadratic: ${JSON.stringify(steps.map((s) => [s.ratio, s.ms]))}`);
  assert.equal(steps.length, 3, "one more step, 64 times, and no further: it was trusted there");
});

test("a linear scanner stops at 16 times, as before: no longer input, no longer run", () => {
  const steps = measure((n) => (10 / (16 * SIZE)) * n);
  assert.equal(steps.length, 2);
  assert.ok(!quadratic(steps));
});

test("a growth that stays suspect but too short to trust stops at the longest input: never beyond MAX_TIMES", () => {
  // 6.2 times slower for 4 times the input at every step, 0.31 ms at 16 times: still under the floor at 256 times.
  const steps = measure((n) => 0.31 * 6.2 ** (Math.log(n / (16 * SIZE)) / Math.log(4)));
  assert.equal(steps.length, Math.log(MAX_TIMES) / Math.log(4), "4, 16, 64 and 256 times");
  assert.ok(
    steps.every((s) => s.ms < MEASURABLE_MS),
    "too short to be trusted: the security test reads none",
  );
});
