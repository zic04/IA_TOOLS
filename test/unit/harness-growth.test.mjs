// The growth measure (test/tools/growth.mjs) on the real clock and the real collector, its canaries both ways. Each
// run is timed in a clean heap (cleanRun): the young generation collected first by Node's own collector, without a
// flag, and the collector's pauses inside the run taken out of its time. A reader that scans the text so far again at
// each line is quadratic, and is seen, whether it allocates nothing, makes garbage or keeps what it allocates; readers
// that are linear but allocate much (a string grown a character at a time, an object a character kept to the end,
// split then join), which set the collector working at one size and not the size below, pass. Each canary's memory
// stays bounded, whatever size a fast machine measures it at: none keeps what grows as the square of its input.
import { test } from "node:test";
import assert from "node:assert/strict";
import v8 from "node:v8";
import { assertLinear, cleanRun } from "../tools/growth.mjs";

/** A text of n lines. */
const lines = (n) => "a line of text\n".repeat(n);

/**
 * The texts of a canary (`build`) and its runs (`clean`: cleanRun), watched: the most heap a whole collection during
 * the runs left live (v8.GCProfiler). `check` asserts it stays linear in the longest text built: 64 MB (the test
 * process itself) and 100 bytes a character at most, where an object a character holds some 50.
 */
function watched(name) {
  let live = 0;
  let longest = 0;
  return {
    build: (n) => {
      const text = lines(n);
      longest = Math.max(longest, text.length);
      return text;
    },
    clean: (measure) => {
      const profiler = new v8.GCProfiler();
      profiler.start();
      const ms = cleanRun(measure);
      for (const s of profiler.stop().statistics)
        if (s.gcType === "MarkSweepCompact") live = Math.max(live, s.afterGC.heapStatistics.usedHeapSize);
      return ms;
    },
    check: () =>
      assert.ok(
        live < 64 * 2 ** 20 + 100 * longest,
        `${name}: ${(live / 2 ** 20).toFixed(0)} MB live, ${longest} characters at most`,
      ),
  };
}

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
  // The last 16 copies kept, not all of them: the collector copies what is kept, as much as the reader copies, while
  // what is held stays a few megabytes (all of them took 1.8 GB at 256 times on macOS, past the heap's limit).
  "the lines so far copied, the last ones kept (what the collector copies grows as fast)": [
    250,
    (text) => {
      const all = text.split("\n");
      const kept = new Array(16);
      let total = 0;
      for (let i = 0; i < all.length; i++) {
        const copy = all.slice(0, i);
        kept[i % kept.length] = copy;
        total += copy.length;
      }
      return total;
    },
  ],
};

test("readers that scan or copy the text so far again at each line are not linear: seen on the real clock", () => {
  for (const [name, [size, run]] of Object.entries(QUADRATIC)) {
    const heap = watched(name);
    assert.throws(
      () => assertLinear(name, { size, build: heap.build, run, clean: heap.clean }),
      (e) => e instanceof Error && e.message.startsWith(`${name}: not linear`),
    );
    heap.check();
  }
});

test("linear readers that allocate much pass: a string grown a character at a time, an object a character, split and join", () => {
  const readers = {
    "a string grown by +=": (text) => {
      let out = "";
      for (const c of text) out += c === "\n" ? " " : c;
      return out.indexOf("\u0000");
    },
    // 720,000 objects kept at 16 times, some 35 MB: the young generation filled there, not at 4 times.
    "an object a character": (text) => Array.from(text, (c, i) => ({ c, i })).filter((o) => o.c === "\n").length,
    "split then join": (text) =>
      text
        .split("\n")
        .map((line) => line.split("").reverse().join(""))
        .join("\n").length,
  };
  for (const [name, run] of Object.entries(readers)) {
    const heap = watched(name);
    assertLinear(name, { size: 3000, build: heap.build, run, clean: heap.clean });
    heap.check();
  }
});
