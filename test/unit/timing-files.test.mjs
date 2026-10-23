// Where time is measured (RULES.md S5): only through test/tools/growth.mjs (assertLinear, linearAt, growthOf), in files
// of their own that test/tools/run-plan.mjs runs alone, after the others, a failure run once more. Never an absolute
// budget in milliseconds ("under a second"): it fails on a busy machine and passes a quadratic reader on a fast one.
// Never a home-made stopwatch in a functional test either: what such a test checks about a bound is a count, or a
// result. This file reads the tests as text, with positive controls: each matcher, run on a sample, flags it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTimingFile } from "../tools/run-plan.mjs";

const TESTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/** The folders whose tests are read: the ones `npm test` runs. */
const FOLDERS = ["unit", "snapshot"];
const SELF = "timing-files.test.mjs";

/**
 * A stopwatch: a clock read to be kept or subtracted from a later one (a date or a timestamp used as data, such as
 * `Date.now() / 1000` or `Date.now() + 5000`, is not one). Each expression is a literal and a few classes, one after the
 * other, bounded by the line: none backtracks.
 */
const STOPWATCH = [
  /\bperformance\s*\.\s*(?:now|mark|measure|timeOrigin)\b/, // the clock, called or kept
  /\bperf_hooks\b/, // imported, and then renamed (perf.now(), clock.now()…)
  /\bprocess\s*\.\s*hrtime\b|\bhrtime\s*[.(]/,
  /=\s*[A-Za-z_$][\w$]*\s*\.\s*now\s*\(\s*\)\s*(?:[;,)]|$)/, // a start kept: `= Date.now();`, `= perf.now();`
  /\.\s*now\s*\(\s*\)\s*-\s*[A-Za-z_$]/, // `Date.now() - start`, `perf.now() - t0`: whatever the object
  /(?<![\w$.])now\s*\(\s*\)\s*-\s*[A-Za-z_$]/, // `now() - t0`
];
const isStopwatch = (line) => STOPWATCH.some((re) => re.test(line));

/** What a duration is called in a budget (`ms < 1000`, `dt < 50`, `times[2] < 1000`, `totalMs <= 20`). */
const DURATION = "(?:ms|dt|delta|lap|elapsed|duration|took|taken|spent|latency|times?\\[\\d+\\]|\\w+Ms)";
/**
 * An absolute budget in milliseconds, in any test file, a timing file too (there only assertLinear decides): a
 * duration compared with a number, either way round; a clock subtracted from a clock and compared
 * (`performance.now() - t0 < 500`); or a number compared in an assertion whose message speaks of milliseconds
 * (`x < 1000, "… ms"`).
 */
const BUDGETS = [
  new RegExp(`\\b${DURATION}\\s*<=?\\s*\\d`), // ms < 1000
  new RegExp(`\\d[\\d_]*\\s*>=?\\s*${DURATION}\\b`), // 1000 > ms
  /\.\s*now\s*\(\s*\)\s*-[^<>=\n]{1,40}<=?\s*\d/, // performance.now() - t0 < 500
  /(?<![\w$.])now\s*\(\s*\)\s*-[^<>=\n]{1,40}<=?\s*\d/, // now() - t0 < 5
  /<=?\s*\d[\d_]*\s*,\s*[`"'][^`"'\n]*\bms\b/, // x < 1000, "… ms"
];
const hasBudget = (line) => BUDGETS.some((re) => re.test(line));

/** The *.test.mjs files of the folders, with their text: [relative path, text]. */
function testFiles() {
  const out = [];
  for (const folder of FOLDERS) {
    const dir = path.join(TESTS, folder);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir, { recursive: true }).map(String)) {
      if (!name.endsWith(".test.mjs") || name === SELF) continue;
      out.push([`${folder}/${name.split(path.sep).join("/")}`, fs.readFileSync(path.join(dir, name), "utf8")]);
    }
  }
  return out;
}

test("the matchers flag what they forbid, and let a date used as data through (positive controls)", () => {
  const stopwatches = [
    "const start = performance" + ".now();",
    "assert.ok(performance" + ".now() - t < 200);",
    "const t = process.hr" + "time.bigint();",
    "assert.ok(Date" + ".now() - start < 1000);",
    "let start = Date" + ".now();",
    "const startedAt = Date" + ".now();",
    // A start kept under any name, a clock under any name
    "const a = Date" + ".now();",
    "  x = Date" + ".now(),",
    "const stamp = Date" + ".now()",
    'import { performance as perf } from "node:perf_' + 'hooks";',
    'const { performance } = require("perf_' + 'hooks");',
    "const t0 = perf" + ".now();",
    "assert.ok(clock" + ".now() - t0 > 3);",
    "const dt = now() " + "- t0;",
    "const { hr" + "time } = process; hrtime.bigint();",
    "performance." + "mark('a');",
    "const origin = performance.time" + "Origin;",
  ];
  for (const text of stopwatches) assert.ok(isStopwatch(text), text);
  const data = [
    "expires: Date" + ".now() / 1000 + 3600,",
    "new Date(Date" + ".now() - 3 * 86400000)",
    "new Date(Date" + ".now() + 5000)",
    'import(href + "?t=" + Date' + ".now())",
    "const now = Date" + ".now() / 1000;",
    "const id = `run-${Date" + ".now()}`;",
    "const unique = String(Date" + ".now()).slice(-4);",
    "const now = 5; assert.equal(now - 1, 4);",
    "assert.equal(new Date().getFullYear() >= 2024, true);",
    "const times = [1, 2]; assert.equal(times.length, 2);",
  ];
  for (const text of data) assert.ok(!isStopwatch(text), text);

  const budgets = [
    "assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);",
    "assert.ok(times[2] < 1000, shown);",
    "assert.ok(elapsed <= 500);",
    "assert.ok(totalMs < 20 || totalMs / base <= 8, `${totalMs} ms`);",
    'assert.ok(results.length < 1000, "linear, under 1000 ms");',
    "assert.ok(large < 50, `${large} ms`);",
    // A duration under another name, a clock compared where it is read, a budget written backwards
    "assert.ok(dt < 50);",
    "assert.ok(delta <= 1_000);",
    "assert.ok(lap < 2000, label);",
    "assert.ok(1000 > ms);",
    "assert.ok(performance" + ".now() - t0 < 500);",
    "assert.ok((perf" + ".now() - t0) < 500);",
    "assert.ok(now() " + "- t0 < 5);",
    "assert.ok(Date" + ".now() - start <= 1000);",
  ];
  for (const line of budgets) assert.ok(hasBudget(line), line);
  const fine = [
    "assert.ok(items.length < 1000, `${items.length} items`);",
    "assert.ok(out.length <= MAX_ITEMS, `${out.length} items`);",
    "const ms = 1000; // the unit of a timeout",
    "assert.equal(sink.items.length, 300);",
    "assert.ok(at16.length < 20, `${at16.length} routes`);",
    "assert.ok(depth < 3 && n > 2000);",
    "const dtd = 5 < 7;",
  ];
  for (const line of fine) assert.ok(!hasBudget(line), line);
});

test("the matchers stay linear: a long line built to make them backtrack is read at once", () => {
  // These are read by the scan below: a matcher that backtracks on them would hang the scan, not pass it.
  const hostile = [
    "now ( ".repeat(5000),
    ". now() -".repeat(5000),
    "= Date . now ( ".repeat(5000),
    "1 > ".repeat(5000),
  ];
  for (const line of hostile) {
    assert.equal(isStopwatch(line), false);
    assert.equal(hasBudget(line), false);
  }
});

test("no test outside the files that measure time reads the clock: Date.now() or performance.now() for a stopwatch", () => {
  const files = testFiles();
  assert.ok(files.length > 100, "the scan sees the tests");
  const found = [];
  for (const [rel, text] of files) {
    if (isTimingFile(text)) continue;
    for (const [i, line] of text.split("\n").entries())
      if (isStopwatch(line)) found.push(`${rel}:${i + 1}: ${line.trim()}`);
  }
  assert.deepEqual(
    found,
    [],
    "time is measured with assertLinear / linearAt (test/tools/growth.mjs) in a *-growth.test.mjs file; a bound is a count",
  );
});

test("no test anywhere states an absolute budget in milliseconds", () => {
  const found = [];
  for (const [rel, text] of testFiles())
    for (const [i, line] of text.split("\n").entries())
      if (hasBudget(line)) found.push(`${rel}:${i + 1}: ${line.trim()}`);
  assert.deepEqual(found, [], "a growth (assertLinear), never a time: it depends on the machine");
});

test("the files that measure time are found by test/tools/run-plan.mjs: every *-growth.test.mjs imports growth.mjs", () => {
  const growth = testFiles().filter(([rel]) => rel.endsWith("-growth.test.mjs"));
  assert.ok(growth.length >= 6, `the growth files: ${growth.map(([rel]) => rel).join(", ")}`);
  for (const [rel, text] of growth) assert.ok(isTimingFile(text), `${rel} must import ../tools/growth.mjs`);
  // The security tests run the ReDoS harness: they measure time as well.
  const security = testFiles().find(([rel]) => rel === "unit/security.test.mjs");
  assert.ok(security && isTimingFile(security[1]));
});

/** The files of test/tools (and its folders) with their text: [relative path, text]. */
function toolFiles() {
  const dir = path.join(TESTS, "tools");
  return fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => [name.split(path.sep).join("/"), fs.readFileSync(path.join(dir, name), "utf8")]);
}

/**
 * The files of test/tools that may import test/tools/growth.mjs or start the ReDoS harness, and why. A test that
 * imports any other helper, one of which imports growth.mjs, would measure time without test/tools/run-plan.mjs seeing
 * it (it reads the test's own imports): it would run in the parallel batch, skewed by the other files.
 */
const MEASURES_TIME = new Map([
  ["redos-worker.mjs", "the ReDoS harness: the growth of every scanner (security.test.mjs starts it, a timing file)"],
]);

test("no helper of test/tools imports the growth measure or starts the harness, but the ones listed with a reason", () => {
  const found = toolFiles()
    .filter(([name, text]) => isTimingFile(text) && !MEASURES_TIME.has(name))
    .map(([name]) => name);
  assert.deepEqual(
    found,
    [],
    "a helper that measures time hides a timing file: list it in MEASURES_TIME, with its reason",
  );
  const tools = toolFiles();
  assert.ok(tools.length > 15, "the scan sees the helpers");
  for (const name of MEASURES_TIME.keys())
    assert.ok(
      tools.some(([n, text]) => n === name && isTimingFile(text)),
      `${name} is listed but no longer measures time: take it off the list`,
    );
  // Positive control: a helper that imports the measure indirectly is flagged by the same test.
  const helper = 'export { assertLinear } from "./gro' + 'wth.mjs";';
  assert.equal(isTimingFile(helper), true);
});
