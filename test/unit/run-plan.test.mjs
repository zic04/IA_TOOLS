// How test/run.mjs runs the files (test/tools/run-plan.mjs): the files that measure time after the others, one at a
// time, one that fails run once more alone; any other failure counts at once; end-to-end files one at a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPlan, testFiles, isTimingFile } from "../tools/run-plan.mjs";

// The paths are built by concatenation: written whole in this file, they would make run-plan.mjs take this very file
// for one that measures time, and run it alone, after the others (a test below checks it does not).
const GROWTH = "../tools/gro" + "wth.mjs";
const WORKER = "../tools/redos-" + "worker.mjs";
const TEXTS = {
  "a.test.mjs": "plain",
  "timed.test.mjs": `import { assertLinear } from "${GROWTH}";`,
  "redos.test.mjs": `import "${WORKER}";`,
  "b.test.mjs": "plain",
};
/** The plan run with exit codes given per call (by the files of the call), what was run and logged. */
function plan(codes = {}, { e2e = false, files = Object.keys(TEXTS) } = {}) {
  const calls = [];
  const logs = [];
  const seen = {};
  const code = runPlan({
    files,
    e2e,
    read: (f) => TEXTS[f],
    run: (list, options) => {
      const key = list.join(" ");
      calls.push([key, options.join(" ")]);
      const n = (seen[key] = (seen[key] ?? 0) + 1);
      const c = codes[key];
      return Array.isArray(c) ? (c[n - 1] ?? 0) : (c ?? 0);
    },
    log: (l) => logs.push(l),
  });
  return { code, calls, logs };
}

test("this file does not measure time itself: it runs in the parallel batch, with the other functional tests", () => {
  assert.equal(isTimingFile(fs.readFileSync(fileURLToPath(import.meta.url), "utf8")), false);
});

test("a file that measures time is one that imports the growth measure or runs the ReDoS harness, nothing else", () => {
  const timing = [
    `import { assertLinear } from "${GROWTH}";`,
    `import {\n  assertLinear,\n  linearAt,\n} from '${GROWTH}';`,
    `const { growthOf } = await import("${GROWTH}");`,
    `const worker = new Worker(new URL("${WORKER}", import.meta.url));`,
    `import "${WORKER}";`,
  ];
  for (const text of timing) assert.equal(isTimingFile(text), true, text);
  const plain = [
    "",
    "// measures its time with test/tools/growth.mjs, in growth-measure.test.mjs", // a comment names it
    'import { growth } from "../tools/my-growth-helper.mjs";', // another file
    'import { x } from "../tools/mygrowth.mjs";', // another file, ending alike
    "const t = performance" + ".now();", // a clock alone: not a measure (test/unit/timing-files.test.mjs refuses it)
    'const note = "see growth.mjs";', // no folder
  ];
  for (const text of plain) assert.equal(isTimingFile(text), false, text);
});

test("the others together first, then each file that measures time alone, in their order", () => {
  const r = plan();
  assert.equal(r.code, 0);
  assert.deepEqual(r.calls, [
    ["a.test.mjs b.test.mjs", ""],
    ["timed.test.mjs", ""],
    ["redos.test.mjs", ""],
  ]);
  assert.deepEqual(r.logs, []);
});

test("a file that measures time and fails once: run once more, alone, and said; passing then, the run passes", () => {
  const r = plan({ "timed.test.mjs": [1, 0] });
  assert.equal(r.code, 0);
  assert.deepEqual(
    r.calls.map((c) => c[0]),
    ["a.test.mjs b.test.mjs", "timed.test.mjs", "timed.test.mjs", "redos.test.mjs"],
  );
  assert.deepEqual(r.logs, ["↻ timed.test.mjs: a file that measures time failed; run once more, alone"]);
});

test("failing twice, it fails the run; any other failure counts at once, without a second run", () => {
  assert.equal(plan({ "redos.test.mjs": [1, 1] }).code, 1);
  const other = plan({ "a.test.mjs b.test.mjs": 1 });
  assert.equal(other.code, 1);
  assert.equal(other.calls.filter((c) => c[0] === "a.test.mjs b.test.mjs").length, 1);
  assert.equal(plan({ "a.test.mjs b.test.mjs": 1, "timed.test.mjs": [3, 3] }).code, 1, "the first failure's code");
  assert.equal(plan({ "timed.test.mjs": [3, 3] }).code, 3);
});

test("end-to-end files: all in one run, one file at a time, never a second run", () => {
  const r = plan({ "a.test.mjs timed.test.mjs redos.test.mjs b.test.mjs": 1 }, { e2e: true });
  assert.equal(r.code, 1);
  assert.deepEqual(r.calls, [["a.test.mjs timed.test.mjs redos.test.mjs b.test.mjs", "--test-concurrency=1"]]);
});

test("only files that measure time: no empty run of the others", () => {
  const r = plan({}, { files: ["timed.test.mjs"] });
  assert.deepEqual(r.calls, [["timed.test.mjs", ""]]);
});

test("the files of the arguments: a folder's *.test.mjs, sorted; one file as it is; none for what is missing", () => {
  const root = path.join("R", "test");
  const unit = path.join(root, "unit");
  const tree = { [unit]: ["b.test.mjs", "a.test.mjs", "helper.mjs", path.join("sub", "c.test.mjs")] };
  const one = path.join(unit, "security.test.mjs");
  const io = {
    root,
    exists: (p) => p in tree || p === one,
    list: (dir) => {
      if (!(dir in tree)) throw new Error(`ENOTDIR: ${dir}`); // a file listed as a folder
      return tree[dir];
    },
  };
  assert.deepEqual(testFiles(["unit"], io), [
    path.join(unit, "a.test.mjs"),
    path.join(unit, "b.test.mjs"),
    path.join(unit, "sub", "c.test.mjs"),
  ]);
  assert.deepEqual(testFiles(["unit/security.test.mjs"], io), [one]);
  assert.deepEqual(testFiles(["snapshot", "unit/gone.test.mjs"], io), [], "nothing: test/run.mjs then exits with 2");
});

test("every npm script that runs tests goes through test/run.mjs: npm run test:security measures time too", () => {
  // The security tests run the ReDoS harness: a bare `node --test` would give a noisy measure no second run.
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  const tests = Object.entries(scripts).filter(([name]) => name === "test" || name.startsWith("test:"));
  assert.ok(tests.some(([name]) => name === "test:security"));
  for (const [name, command] of tests) assert.match(command, /^node test\/run\.mjs /, name);
  // Files of test/ are a plan of their own: the runner takes each as it takes a folder.
  const security = scripts["test:security"].replace(/^node test\/run\.mjs /, "").split(" ");
  assert.ok(security.length > 0 && security.every((f) => f.endsWith(".test.mjs")), scripts["test:security"]);
  for (const file of security) assert.ok(fs.existsSync(path.join(root, "test", file)), `${file} exists`);
  const read = (file) => fs.readFileSync(path.join(root, "test", file), "utf8");
  assert.ok(
    security.some((file) => /redos-worker/.test(read(file))),
    "one of them runs the ReDoS harness",
  );
});
