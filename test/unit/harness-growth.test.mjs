// The growth measure (test/tools/growth.mjs) on the real clock and the real collector, its canaries both ways. Each
// run is timed in a clean heap (cleanRun): the young generation collected first by Node's own collector, without a
// flag, and the collector's pauses inside the run taken out of its time. A reader that scans the text so far again at each line is
// quadratic, and is seen, whether it allocates nothing, makes garbage or keeps what it allocates; readers that are
// linear but allocate much (a string grown a character at a time, an object a character kept to the end, split then
// join), which set the collector working at one size and not the size below, pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import v8 from "node:v8";
import { assertLinear, cleanRun } from "../tools/growth.mjs";

/** A text of n lines. */
const lines = (n) => "a line of text\n".repeat(n);

/** What the young generation holds (bytes). */
const young = () => v8.getHeapSpaceStatistics().find((s) => s.space_name === "new_space")?.space_used_size ?? NaN;

test("cleanRun: the young generation collected before the run, what nothing holds gone; never in the run's time", () => {
  // Some 300 KB of objects nothing holds, left in the young generation just collected (under its smallest size: no
  // scavenge in between).
  cleanRun(() => 0);
  assert.equal(Array.from({ length: 10_000 }, (_, i) => ({ i })).length, 10_000);
  const before = young();
  let during = NaN;
  // The run gives its time (a played 1,000 ms) and allocates nothing: nothing taken out of it.
  const left = cleanRun(() => {
    during = young();
    return 1000;
  });
  assert.ok(during < before / 2, `${during} bytes in the young generation during the run, ${before} before`);
  assert.equal(left, 1000, "the collection before the run is not taken out of its time");
});

test("cleanRun: the collector's pauses inside the run are taken out of its time", () => {
  // A played run of 1,000 ms that holds a whole collection: its pause is the collector's time, not the run's.
  const left = cleanRun(() => {
    cleanRun(() => 0);
    return 1000;
  });
  assert.ok(left > 0 && left < 1000, `${left} of 1000`);
});

/** Readers quadratic on the real clock: each scans or copies the text so far again at each line. */
const QUADRATIC = {
  "the text so far scanned again (nothing allocated)": [
    250,
    (text) => {
      let found = 0;
      for (let end = text.indexOf("\n"); end !== -1; end = text.indexOf("\n", end + 1))
        found += text.lastIndexOf("\u0000", end);
      return found;
    },
  ],
  "the text so far split again (garbage)": [
    100,
    (text) => {
      let count = 0;
      for (let end = text.indexOf("\n"); end !== -1; end = text.indexOf("\n", end + 1))
        count += text.slice(0, end).split("\n").length;
      return count;
    },
  ],
  "the lines so far copied and kept (what the collector copies grows as fast)": [
    120,
    (text) => {
      const all = text.split("\n");
      const kept = [];
      for (let i = 0; i < all.length; i++) kept.push(all.slice(0, i));
      return kept.length;
    },
  ],
};

test("readers that scan or copy the text so far again at each line are not linear: seen on the real clock", () => {
  for (const [name, [size, run]] of Object.entries(QUADRATIC))
    assert.throws(
      () => assertLinear(name, { size, build: lines, run }),
      (e) => e instanceof Error && e.message.startsWith(`${name}: not linear`),
    );
});

test("linear readers that allocate much pass: a string grown a character at a time, an object a character, split and join", () => {
  const readers = {
    "a string grown by +=": (text) => {
      let out = "";
      for (const c of text) out += c === "\n" ? " " : c;
      return out.indexOf("\u0000");
    },
    // 1.4 million objects kept at 16 times: the young generation filled there, not at 4 times.
    "an object a character": (text) => Array.from(text, (c, i) => ({ c, i })).filter((o) => o.c === "\n").length,
    "split then join": (text) =>
      text
        .split("\n")
        .map((line) => line.split("").reverse().join(""))
        .join("\n").length,
  };
  for (const [name, run] of Object.entries(readers)) assertLinear(name, { size: 6000, build: lines, run });
});
