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

/** A stopwatch: a clock read to be subtracted from a later one (a date or a timestamp used as data is not one). */
const STOPWATCH =
  /\bperformance\.now\s*\(|\bprocess\.hrtime\b|\bDate\.now\s*\(\s*\)\s*-\s*[A-Za-z_$]|\b(?:start|started|t0|begin)\w*\s*=\s*Date\.now\s*\(/;

/**
 * An absolute budget in milliseconds: a duration compared with a number (`ms < 1000`, `times[2] < 1000`), or a number
 * compared in an assertion whose message speaks of milliseconds (`x < 1000, "… ms"`).
 */
const BUDGETS = [
  /\b(?:ms|elapsed|duration|took|times?\[\d+\]|\w+Ms)\s*<=?\s*\d/,
  /<=?\s*\d[\d_]*\s*,\s*[`"'][^`"'\n]*\bms\b/,
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
  ];
  for (const text of stopwatches) assert.ok(STOPWATCH.test(text), text);
  const data = [
    "expires: Date" + ".now() / 1000 + 3600,",
    "new Date(Date" + ".now() - 3 * 86400000)",
    "new Date(Date" + ".now() + 5000)",
    'import(href + "?t=" + Date' + ".now())",
    "const now = Date" + ".now() / 1000;",
  ];
  for (const text of data) assert.ok(!STOPWATCH.test(text), text);

  const budgets = [
    "assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);",
    "assert.ok(times[2] < 1000, shown);",
    "assert.ok(elapsed <= 500);",
    "assert.ok(totalMs < 20 || totalMs / base <= 8, `${totalMs} ms`);",
    'assert.ok(results.length < 1000, "linear, under 1000 ms");',
    "assert.ok(large < 50, `${large} ms`);",
  ];
  for (const line of budgets) assert.ok(hasBudget(line), line);
  const fine = [
    "assert.ok(items.length < 1000, `${items.length} items`);",
    "assert.ok(out.length <= MAX_ITEMS, `${out.length} items`);",
    "const ms = 1000; // the unit of a timeout",
    "assert.equal(sink.items.length, 300);",
  ];
  for (const line of fine) assert.ok(!hasBudget(line), line);
});

test("no test outside the files that measure time reads the clock: Date.now() or performance.now() for a stopwatch", () => {
  const files = testFiles();
  assert.ok(files.length > 100, "the scan sees the tests");
  const found = [];
  for (const [rel, text] of files) {
    if (isTimingFile(text)) continue;
    for (const [i, line] of text.split("\n").entries())
      if (STOPWATCH.test(line)) found.push(`${rel}:${i + 1}: ${line.trim()}`);
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
